import type { ActorContext } from '$lib/models/identity';
import type { TokenCodec } from '$lib/models/tokenization';
import type { RetrievalProvider } from './factories/retrieval-providers';
import type { ToolRanking, ToolSeeding } from './services/agent/tools/tool-search';
import type { WebReferenceClient } from '$lib/server/services/references/web-research';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import {
	ProductionControllerFactory,
	type ProductionControllerDependencies
} from '$lib/server/factories/production-controller-factory';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import {
	DEFAULT_GENERATION_MODEL,
	DEFAULT_LANGUAGE_MODEL_BASE_URL,
	optionalProperty
} from './config';
import type { Database } from './db';
import type { McpSurfaceFactory } from './factories/agent/mcp-tool-factory';
import { createAgentCapability } from './factories/capabilities/agent-capability-factory';
import { createAgentFilesCapability } from './factories/capabilities/agent-files-capability-factory';
import { createAttachmentsCapability } from './factories/capabilities/attachments-capability-factory';
import { createDeliverablesCapability } from './factories/capabilities/deliverables-capability-factory';
import { createDiagramsCapability } from './factories/capabilities/diagrams-capability-factory';
import { createFeedbackCapability } from './factories/capabilities/feedback-capability-factory';
import { createIdentityCapability } from './factories/capabilities/identity-capability-factory';
import { createKnowledgeSearchCapability } from './factories/capabilities/knowledge-search-capability-factory';
import { createMemoryCapability } from './factories/capabilities/memory-capability-factory';
import { createNotesCapability } from './factories/capabilities/notes-capability-factory';
import { createProjectsCapability } from './factories/capabilities/projects-capability-factory';
import { createReferencesCapability } from './factories/capabilities/references-capability-factory';
import { createRelationshipsCapability } from './factories/capabilities/relationships-capability-factory';
import { createSkillsCapability } from './factories/capabilities/skills-capability-factory';
import { createSuggestionsCapability } from './factories/capabilities/suggestions-capability-factory';
import { createSyncCapability } from './factories/capabilities/sync-capability-factory';
import { createTodosCapability } from './factories/capabilities/todos-capability-factory';
import { createWidgetsCapability } from './factories/capabilities/widgets-capability-factory';
import type {
	IAttachmentStorage,
	ObjectStorageConfig
} from './services/attachments/object-storage';
import type { AgentModelCatalog } from './services/agent/runs/preferences';
import type { AttachmentClaims } from './repositories/attachments/claims';
import type { ProvenanceRecorder } from './services/notes/provenance';
import type { NotificationChannel } from './db';

/**
 * Collaborators that reach outside the process and are therefore worth
 * replacing in an isolated run (evals, integration tests). Everything else —
 * repositories, services, the agent loop — is constructed identically to
 * production so that an isolated run exercises the real code paths.
 */
export interface ApplicationOverrides {
	readonly retrievalProvider?: RetrievalProvider;
	readonly toolSearch?: ToolSeeding & ToolRanking;
	readonly attachmentStorage?: IAttachmentStorage;
	readonly referenceClient?: WebReferenceClient;
	readonly modelCatalog?: AgentModelCatalog;
}

export interface ApplicationConfig {
	readonly attachmentClaims: AttachmentClaims;
	readonly db: Database;
	/** Postgres LISTEN, through which run changes reach every process. */
	readonly notifications: NotificationChannel;
	readonly transactionRunner: TransactionRunner;
	/** The cl100k token codec. Loading its tables is the costly part of composition, so the process builds it once. */
	readonly tokenizer: TokenCodec;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL?: string;
	readonly appURL?: string;
	readonly defaultAgentModel?: string;
	readonly defaultVisionModel?: string;
	/** Mistral Document AI, which serves attachment OCR. */
	readonly mistralApiKey: string;
	readonly mistralBaseURL?: string;
	readonly ocrModel?: string;
	readonly recommendedModels?: readonly string[];
	readonly s3?: ObjectStorageConfig;
	readonly overrides?: ApplicationOverrides;
	/**
	 * Stage chunks without vectors and let the background worker embed them,
	 * instead of paying for an embedding round-trip inside the write transaction.
	 * Defaults off, so runners without a worker (evals, tests) stay consistent
	 * the moment a write returns.
	 */
	readonly deferEmbedding?: boolean;
}

export interface ProductionApplication {
	readonly mcpSurface: McpSurfaceFactory;
	readonly controllers: ControllerFactory;
	/**
	 * Not reachable through `ControllerFactory`, but the MCP server needs to
	 * mint a provenance row per session so tool writes are attributable.
	 */
	readonly provenance: ProvenanceRecorder;
}

/**
 * Wires the whole application graph against an explicit database and set of
 * external collaborators. `createProductionFactory` supplies these from the
 * environment; isolated runners supply a testcontainer database and cached or
 * faked external edges.
 */
export function createApplication(
	actor: ActorContext,
	config: ApplicationConfig
): ProductionApplication {
	const db = config.db;
	const transactionRunner = config.transactionRunner;
	const overrides = config.overrides ?? {};
	const openRouterApiKey = config.openRouterApiKey;
	const openRouterBaseURL = config.openRouterBaseURL ?? DEFAULT_LANGUAGE_MODEL_BASE_URL;
	const appURL = config.appURL ?? 'http://localhost:5173';
	const defaultAgentModel = config.defaultAgentModel ?? DEFAULT_GENERATION_MODEL;
	const defaultVisionModel =
		config.defaultVisionModel ??
		process.env.OPENROUTER_ATTACHMENT_VISION_MODEL ??
		defaultAgentModel;
	const deferEmbedding = config.deferEmbedding ?? false;
	const identity = createIdentityCapability(actor, { db });
	const synchronization = createSyncCapability(actor, { db, deferEmbedding });
	const projectCapability = createProjectsCapability(actor, { db });
	const noteCapability = createNotesCapability(actor, {
		db,
		projects: projectCapability.repository
	});
	const todoCapability = createTodosCapability(actor, {
		db,
		projects: projectCapability.repository,
		notes: noteCapability.repository,
		anchors: noteCapability.anchors,
		provenance: noteCapability.provenanceRepository
	});
	const relationshipCapability = createRelationshipsCapability(actor, {
		db,
		notes: noteCapability.repository,
		anchors: noteCapability.anchors,
		provenance: noteCapability.provenanceRepository,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		defaultModel: DEFAULT_GENERATION_MODEL
	});
	const referenceCapability = createReferencesCapability(actor, {
		db,
		notes: noteCapability.repository,
		anchors: noteCapability.anchors,
		provenance: noteCapability.provenanceRepository,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		defaultModel: defaultAgentModel,
		client: overrides.referenceClient
	});
	const suggestionCapability = createSuggestionsCapability(actor, {
		db,
		notes: noteCapability.repository,
		anchors: noteCapability.anchors,
		provenance: noteCapability.provenanceRepository
	});
	const skillCapability = createSkillsCapability(actor, {
		db,
		projects: projectCapability.repository,
		notes: noteCapability.repository,
		provenance: noteCapability.provenanceRepository
	});

	const projectRepository = projectCapability.repository;
	const projects = projectCapability;
	const noteRepository = noteCapability.repository;
	const anchorRepository = noteCapability.anchors;
	const provenanceRepository = noteCapability.provenanceRepository;
	const notes = noteCapability.services;
	const provenance = noteCapability.provenance;
	const todos = todoCapability.services;
	const knowledgeSearch = createKnowledgeSearchCapability(actor, {
		db,
		transactionRunner,
		tokenizer: config.tokenizer,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		...optionalProperty('retrievalProvider', overrides.retrievalProvider),
		...optionalProperty('toolSearch', overrides.toolSearch),
		deferEmbedding
	});
	const knowledge = knowledgeSearch.knowledge;
	const noteIndexer = knowledge;
	const diagramIndexer = knowledge;
	const memoryIndexer = knowledge;
	const agentFilesCapability = createAgentFilesCapability(actor, {
		tokens: knowledgeSearch.tokenizer,
		db,
		projects: projectRepository,
		notes: noteRepository
	});
	const widgets = createWidgetsCapability(actor, {
		db,
		projects: projectRepository,
		notes: noteRepository
	});
	const memory = createMemoryCapability(actor, {
		db,
		projects: projectRepository,
		provenance: provenanceRepository
	});
	const agentCapability = createAgentCapability(actor, {
		tokens: knowledgeSearch.tokenizer,
		db,
		notifications: config.notifications,
		controllers: () => controllerFactory,
		toolRetriever: knowledgeSearch.toolDiscovery,
		files: agentFilesCapability.repository,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		defaultModel: defaultAgentModel,
		defaultVisionModel,
		recommendedModels: config.recommendedModels ?? [],
		modelCatalog: overrides.modelCatalog
	});
	const {
		conversations: conversationSessions,
		conversationMessages,
		preferences,
		models: modelCatalog,
		toolPreferences,
		trust,
		runLedger: runStore,
		sessions: agentSessions,
		context: agentContext,
		settlements: runSettlements,
		runSignals
	} = agentCapability;
	const finalizedKnowledgeSearch = knowledgeSearch.finalize({ preferences });
	const feedback = createFeedbackCapability(actor, { db });
	const attachmentCapability = createAttachmentsCapability(actor, {
		claims: config.attachmentClaims,
		transactionRunner,
		visionModel: defaultVisionModel,
		db,
		notes: noteRepository,
		preferences,
		indexer: knowledge,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		mistralApiKey: config.mistralApiKey,
		mistralBaseURL: config.mistralBaseURL,
		ocrModel: config.ocrModel,
		s3: config.s3,
		storage: overrides.attachmentStorage
	});
	const attachmentStorage = attachmentCapability.storage;
	const deliverables = createDeliverablesCapability(actor, {
		db,
		storage: attachmentStorage
	});
	const templates = deliverables.templates;
	const artifacts = deliverables.artifacts;
	const relationships = relationshipCapability;
	const references = referenceCapability;

	const suggestions = suggestionCapability;
	const skills = skillCapability.services;
	const diagramCapability = createDiagramsCapability(actor, {
		contextNotes: notes.reader,
		contextSkills: skills.finder,
		contextMemory: memory.lister,
		apiKey: openRouterApiKey,
		baseURL: openRouterBaseURL,
		appURL,
		db,
		notes: noteRepository,
		anchors: anchorRepository,
		sessions: agentSessions,
		provenanceRepository,
		provenance,
		context: agentContext,
		conversations: conversationSessions,
		conversationMessages,
		preferences,
		models: modelCatalog,
		runs: runStore,
		builtInSkills: skillCapability.builtIns,
		defaultModel: defaultAgentModel,
		defaultVisionModel,
		projects: projectRepository
	});
	const diagrams = diagramCapability.services;
	const dependencies: ProductionControllerDependencies = {
		agentFiles: {
			reader: agentFilesCapability.reader
		},
		todos: {
			boardExport: todoCapability.boardExport,
			todoPresentation: todoCapability.presentation,
			todoEditingRules: todoCapability.editingRules,
			todoCreationRules: todoCapability.creationRules,
			todoBatchReceipts: todoCapability.batchReceipts,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			todoLister: todos.lister,
			todoContextReader: todos.context,
			todoReader: todos.reader,
			todoEditor: todos.editor,
			todoDeleter: todos.deleter,
			selectionOrigins: noteCapability.selectionOrigins,
			promiseExtractor: todoCapability.promiseExtractor,
			suggestionCreator: suggestions.creator,
			trustPolicyEvaluator: trust,
			todoCreator: todos.creator,
			suggestionAccepter: suggestions.accepter,
			suggestionEffects: suggestionCapability.effects,
			transactionRunner,
			projectLister: projects.lister,
			markdownToContent: deliverables.markdownToContent,
			exportPreparer: deliverables.prepareExport,
			pdfGenerator: deliverables.pdfGenerator,
			noteActionRequests: agentCapability.noteActionRequests,
			runSettlements,
			runSignals,
			promiseGeneration: todoCapability.promiseGeneration,
			promiseRules: todoCapability.promiseRules
		},
		relationships: {
			selectionOrigins: noteCapability.selectionOrigins,
			knowledge,
			relationshipClassifier: relationshipCapability.classifier,
			suggestionCreator: suggestions.creator,
			transactionRunner,
			noteActionRequests: agentCapability.noteActionRequests,
			runSettlements,
			runSignals,
			relationshipGeneration: relationshipCapability.generation,
			relationshipRules: relationshipCapability.rules
		},
		references: {
			selectionOrigins: noteCapability.selectionOrigins,
			referenceClient: referenceCapability.client,
			referenceCandidates: referenceCapability.candidates,
			researchSettings: referenceCapability.settings,
			researchOverrides: referenceCapability.overrides,
			referenceRanker: referenceCapability.ranking,
			suggestionCreator: suggestions.creator,
			transactionRunner,
			noteActionRequests: agentCapability.noteActionRequests,
			runSettlements,
			runSignals,
			referenceModel: referenceCapability.model
		},
		diagrams: {
			generationRules: diagramCapability.generationRules,
			diagramSourceNotes: notes.reader,
			selectionOrigins: noteCapability.selectionOrigins,
			generation: diagramCapability.generation,
			suggestionCreator: suggestions.creator,
			transactionRunner,
			diagramFinder: diagrams.finder,
			mermaidValidator: diagramCapability.mermaidValidator,
			now: diagramCapability.now,
			drawioXmlValidator: diagramCapability.xmlValidator,
			mermaidRenderer: diagramCapability.renderer,
			textExtractor: diagramCapability.textExtractor,
			diagramWriter: diagrams.writer,
			diagramIndexer,
			noteActionRequests: agentCapability.noteActionRequests,
			runSettlements,
			runSignals
		},
		diagramStudio: {
			projectChoice: projects.choice,
			projectLister: projects.lister,
			diagramEditing: diagramCapability.editingRules,
			diagramLifecycle: diagramCapability.lifecycleRules,
			diagramSourceNotes: notes.reader,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			transactionRunner,
			diagramFinder: diagrams.finder,
			diagramLister: diagrams.lister,
			diagramConversations: diagrams.conversations,
			diagramReferences: diagrams.references,
			diagramDraftWriter: diagrams.draftWriter,
			diagramRevisionReader: diagrams.revisionReader,
			diagramTrash: diagrams.lifecycle,
			diagramWriter: diagrams.writer,
			diagramIndexer,
			drawioXmlValidator: diagramCapability.xmlValidator,
			drawioSvgSanitizer: diagramCapability.svgSanitizer,
			drawioLabels: diagramCapability.labels,
			diagramLabelPresentation: diagramCapability.labelPresentation,
			iconSearch: diagramCapability.iconSearch,
			canvasSource: diagramCapability.canvasSource,
			now: diagramCapability.now
		},
		suggestions: {
			todoCreationRules: todoCapability.creationRules,
			suggestionPresentation: suggestionCapability.presentation,
			suggestionLister: suggestions.lister,
			suggestionExpirer: suggestions.expirer,
			suggestionContextReader: suggestions.context,
			suggestionFinder: suggestions.finder,
			suggestionAccepter: suggestions.accepter,
			suggestionEffects: suggestionCapability.effects,
			todoCreator: todos.creator,
			relationshipCreator: relationships.creator,
			referenceCreator: references.creator,
			memoryChanges: memory.changes,
			sourceNotes: notes.reader,
			memoryIndexer,
			diagramIndexer,
			diagramWriter: diagrams.writer,
			drawioXmlValidator: diagramCapability.xmlValidator,
			drawioSvgSanitizer: diagramCapability.svgSanitizer,
			drawioLabels: diagramCapability.labels,
			diagramLabelPresentation: diagramCapability.labelPresentation,
			now: diagramCapability.now,
			transactionRunner,
			suggestionRejecter: suggestions.rejecter,
			suggestionReverter: suggestions.reverter
		},
		agentHarness: {
			runStatus: agentCapability.runStatus,
			streamPresentation: agentCapability.streamPresentation,
			conversationHistory: agentCapability.conversationHistory,
			imagePreparation: agentCapability.imagePreparation,
			modelSelection: agentCapability.modelSelection,
			modelChoices: agentCapability.modelChoices,
			runSettings: agentCapability.runSettings,
			webSearchOverrides: agentCapability.webSearchOverrides,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			conversationSessions,
			conversationMessages,
			toolActivity: agentCapability.toolActivity,
			traceContext: agentCapability.traceContext,
			preferences,
			models: modelCatalog,
			runs: agentCapability.harnessRecords.runs,
			cancellations: agentCapability.cancellations,
			approvals: agentCapability.approvals,
			preparation: agentCapability.preparation,
			checkpoints: agentCapability.checkpoints,
			events: agentCapability.harnessRecords.events,
			decisions: agentCapability.harnessRecords.decisions,
			sessions: agentCapability.harnessRecords.sessions,
			transactionRunner,
			defaultModel: defaultAgentModel,
			defaultVisionModel,
			turns: agentCapability.turns,
			prompts: agentCapability.prompts,
			toolRecovery: agentCapability.toolRecovery,
			agentAvailable: agentCapability.agentAvailable,
			...agentCapability.toolConstruction,
			toolPreferences: agentCapability.toolPreferences,
			toolCatalog: agentCapability.toolCatalog,
			toolApproval: agentCapability.toolApproval,
			toolSearch: knowledgeSearch.toolDiscovery,
			observeTurn: agentCapability.observeTurn,
			settlements: runSettlements,
			runSignals,
			contextFormatter: agentContext,
			contextNotes: notes.reader,
			contextSkills: skills.finder,
			contextWidgets: widgets.reader,
			contextDiagrams: diagrams.finder,
			contextAttachments: attachmentCapability.reader,
			contextFiles: agentFilesCapability.references,
			builtInSkills: skillCapability.builtIns,
			contextMemory: memory.lister,
			contextProjects: projects.reader,
			provenance
		},
		agentSettings: {
			preferenceEditing: agentCapability.preferenceEditing,
			modelSelection: agentCapability.modelSelection,
			modelChoices: agentCapability.modelChoices,
			runSettings: agentCapability.runSettings,
			webSearchOverrides: agentCapability.webSearchOverrides,
			agentAvailable: agentCapability.agentAvailable,
			now: agentCapability.now,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			transactionRunner,
			preferences,
			models: modelCatalog,
			defaultModel: defaultAgentModel,
			defaultVisionModel
		},
		userSettings: {
			preferences: identity.userPreferences,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			transactionRunner
		},
		apiTokens: {
			tokens: identity.apiTokens
		},
		toolPreferences: {
			preferences: toolPreferences,
			catalog: agentCapability.toolCatalog,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			transactionRunner
		},
		attachments: {
			uploads: attachmentCapability.uploads,
			reader: attachmentCapability.reader,
			storage: attachmentCapability.storage,
			lifecycle: attachmentCapability.lifecycle,
			todoReader: todos.reader,
			transactionRunner,
			attachmentIndexer: knowledge
		},
		deliverables: {
			exportSettingsRules: deliverables.exportSettingsRules,
			artifactFiles: deliverables.artifactFiles,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			...templates,
			templateStorage: deliverables.templateStorage,
			templateStyles: deliverables.templateStyles,
			noteReader: notes.reader,
			provenanceRecorder: provenance,
			artifactWriter: artifacts.artifactWriter,
			artifactStorage: deliverables.artifactStorage,
			attachmentReader: attachmentCapability.reader,
			attachmentStorage: attachmentCapability.storage,
			fetchImage: deliverables.fetchImage,
			prepareExport: deliverables.prepareExport,
			widgetReader: widgets.reader,
			todoLister: todos.lister,
			noteLister: notes.treeReader,
			diagramReader: diagrams.finder,
			diagramRenderer: deliverables.diagramRenderer,
			mermaidThemes: deliverables.mermaidThemes,
			widgetExports: deliverables.widgetExports,
			widgetSources: deliverables.widgetSources,
			widgetEvaluation: deliverables.widgetEvaluation,
			docxGenerator: deliverables.docxGenerator,
			pdfGenerator: deliverables.pdfGenerator,
			zipPacker: deliverables.zipPacker,
			exportSettingsReader: artifacts.exportSettingsReader,
			exportSettingsWriter: artifacts.exportSettingsWriter,
			artifactLister: artifacts.artifactLister,
			artifactReader: artifacts.artifactReader,
			artifactDeleter: artifacts.artifactDeleter,
			transactionRunner
		},
		skills: {
			markdown: noteCapability.markdown,
			projectChoice: projects.choice,
			projectLister: projects.lister,
			skillPortability: skillCapability.portability,
			skillMetadataEditing: skillCapability.metadataEditing,
			noteReferences: noteCapability.references,
			noteCreationRules: noteCapability.creationRules,
			noteEditingRules: noteCapability.editingRules,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			skillFinder: skills.finder,
			builtInSkills: skillCapability.builtIns,
			skillUsageLister: skills.usageLister,
			skillUsageRecorder: skills.usageRecorder,
			revisionRecorder: notes.revisionRecorder,
			noteEditor: notes.editor,
			revisionReader: notes.revisionReader,
			attachmentRestorer: notes.attachmentRestorer,
			anchorRepairer: notes.anchorRepairer,
			noteIndexer,
			noteLinkReconciler: relationships.reconciler,
			skillEditor: skills.editor,
			skillPinWriter: skillCapability.pins,
			selectionOrigins: noteCapability.selectionOrigins,
			skillCreator: skills.creator,
			noteCreation: notes.creator,
			transactionRunner
		},
		workspace: {
			todoPresentation: todoCapability.presentation,
			memoryPresentation: memory.presentation,
			syncChanges: synchronization.changes,
			resourceVersions: synchronization.resourceVersions,
			resourceKeys: synchronization.resourceKeys,
			writeRecovery: synchronization.mutations,
			syncObjects: synchronization.objectReader,
			userReader: identity.userReader,
			projectLister: projects.lister,
			noteTreeReader: notes.treeReader,
			skillFinder: skills.finder,
			builtInSkills: skillCapability.builtIns,
			transactionRunner,
			suggestionLister: suggestions.lister,
			suggestionExpirer: suggestions.expirer,
			todoLister: todos.lister,
			waitingOnFinder: todos.waitingOn,
			todoContextReader: todos.context
		},
		notes: {
			agentFiles: agentFilesCapability.references,
			projectChoice: projects.choice,
			projectLister: projects.lister,
			todoPresentation: todoCapability.presentation,
			textSearch: noteCapability.textSearch,
			sections: noteCapability.sections,
			noteReferences: noteCapability.references,
			noteCreationRules: noteCapability.creationRules,
			noteTrashRules: noteCapability.trashRules,
			notePublicationRules: noteCapability.publicationRules,
			noteEditingRules: noteCapability.editingRules,
			notePresentation: noteCapability.presentation,
			suggestionPresentation: suggestionCapability.presentation,
			markdown: noteCapability.markdown,
			archiveImport: noteCapability.archiveImport,
			patchPreparation: noteCapability.patchPreparation,
			revisionComparison: noteCapability.revisionComparison,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			noteReader: notes.reader,
			noteTreeReader: notes.treeReader,
			noteTextSearcher: notes.textSearcher,
			noteCreation: notes.creator,
			noteSectionNumbering: notes.sectionNumbering,
			projectReader: projects.reader,
			userPreferences: identity.userPreferences,
			relationshipFinder: relationships.finder,
			backlinkContextReader: relationships.contexts,
			noteLinkReconciler: relationships.reconciler,
			referenceLister: references.lister,
			referenceContextReader: references.contexts,
			diagramLister: diagrams.lister,
			todoLister: todos.lister,
			todoContextReader: todos.context,
			suggestionLister: suggestions.lister,
			suggestionExpirer: suggestions.expirer,
			suggestionContextReader: suggestions.context,
			noteEditor: notes.editor,
			noteTrash: notes.trash,
			noteTrashReader: notes.trashReader,
			noteDeletion: notes.deletion,
			attachmentRestorer: notes.attachmentRestorer,
			notePublisher: notes.publisher,
			revisionRecorder: notes.revisionRecorder,
			revisionReader: notes.revisionReader,
			anchorRepairer: notes.anchorRepairer,
			noteIndexer,
			transactionRunner
		},
		trustPolicies: {
			trustPolicyStore: trust,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			transactionRunner
		},
		memory: {
			editing: memory.editing,
			presentation: memory.presentation,
			memoryIndexer,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			memoryLister: memory.lister,
			memoryCreator: memory.creator,
			memoryEditor: memory.editor,
			memoryDeleter: memory.deleter,
			memoryChanges: memory.changes,
			suggestionCreator: suggestions.creator,
			suggestionAccepter: suggestions.accepter,
			suggestionEffects: suggestionCapability.effects,
			trustPolicyEvaluator: trust,
			transactionRunner
		},
		widgets: {
			projectChoice: projects.choice,
			projectLister: projects.lister,
			catalogReader: widgets.catalogReader,
			widgetEditingRules: widgets.widgetEditingRules,
			widgetPatches: widgets.widgetPatches,
			widgetCandidateReader: widgets.widgetCandidateReader,
			lifecycle: widgets.lifecycle,
			catalog: widgets.catalog,
			search: widgets.search,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			widgetReader: widgets.reader,
			widgetLister: widgets.lister,
			widgetWriter: widgets.writer,
			widgetIndexer: knowledge,
			transactionRunner
		},
		projects: {
			noteCreationRules: noteCapability.creationRules,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			placement: projects.placement,
			details: projects.details,
			presentation: projects.presentation,
			projectLifecycle: projects.lifecycle,
			projectCreator: projects.creator,
			projectReader: projects.reader,
			projectLister: projects.lister,
			projectEditor: projects.editor,
			projectTreeReader: projects.treeReader,
			noteCreation: notes.creator,
			entryWriter: projects.treeWriter,
			transactionRunner
		},
		retrieval: {
			knowledge,
			conversations: conversationMessages
		},
		inlineSuggestions: {
			context: finalizedKnowledgeSearch.inlineContext,
			noteReader: notes.reader,
			preferences: finalizedKnowledgeSearch.preferences,
			completion: finalizedKnowledgeSearch.completion,
			defaultCompletionModel: finalizedKnowledgeSearch.defaultCompletionModel,
			knowledge,
			memory: memory.lister,
			observer: finalizedKnowledgeSearch.observer,
			workflow: finalizedKnowledgeSearch.workflow,
			// Controllers are constructed per request, so the process-wide spend
			// guard is wired once here.
			admission: finalizedKnowledgeSearch.admission,
			now: Date.now
		},
		feedback,
		attachmentProcessing: attachmentCapability.processing,
		knowledgeIndexing: knowledgeSearch.indexing
	};
	const controllerFactory = new ProductionControllerFactory(actor, dependencies);
	return {
		controllers: controllerFactory,
		mcpSurface: agentCapability.mcpSurface,
		provenance
	};
}
