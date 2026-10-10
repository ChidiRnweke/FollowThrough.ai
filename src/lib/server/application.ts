import type { McpSurfaceFactory } from './factories/agent/mcp-tool-factory';
import {
	ProductionControllerFactory,
	type ProductionControllerDependencies
} from '$lib/server/factories/production-controller-factory';
import type { AgentModelCatalog } from './services/agent/runs/preferences';
import type { ProvenanceRecorder } from './services/notes/provenance';
import type { ToolRetriever } from './controllers/tool-discovery/controller';
import type { ITextRecognition } from './controllers/attachment-processing/controller';
import type { IImageDescription } from './controllers/attachment-processing/controller';
import type { AttachmentClaims } from './services/attachments/contracts';
import type { EmbeddingClient } from './services/knowledge-search/contracts';
import type { ISearchQueryGeneration } from './services/knowledge-search/query-generation';
import type { Reranker } from './services/knowledge-search/contracts';
import type { ReferenceFinder } from '$lib/server/services/references/discovery';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import type { Database } from './db';
import { DEFAULT_GENERATION_MODEL, DEFAULT_LANGUAGE_MODEL_BASE_URL } from './config';
import type {
	IAttachmentStorage,
	ObjectStorageConfig
} from './repositories/attachments/object-storage';
import type { AgentEventBus } from './stores/agent/events';
import type { ScheduledTask } from '$lib/models/maintenance';
import { createIdentityCapability } from './factories/capabilities/identity-capability-factory';
import { createProjectsCapability } from './factories/capabilities/projects-capability-factory';
import { createSyncCapability } from './factories/capabilities/sync-capability-factory';
import { createNotesCapability } from './factories/capabilities/notes-capability-factory';
import { createReferencesCapability } from './factories/capabilities/references-capability-factory';
import { createRelationshipsCapability } from './factories/capabilities/relationships-capability-factory';
import { createTodosCapability } from './factories/capabilities/todos-capability-factory';
import { createSuggestionsCapability } from './factories/capabilities/suggestions-capability-factory';
import { createKnowledgeSearchCapability } from './factories/capabilities/knowledge-search-capability-factory';
import { createSkillsCapability } from './factories/capabilities/skills-capability-factory';
import { createMemoryCapability } from './factories/capabilities/memory-capability-factory';
import { createWidgetsCapability } from './factories/capabilities/widgets-capability-factory';
import { createAttachmentsCapability } from './factories/capabilities/attachments-capability-factory';
import { createDeliverablesCapability } from './factories/capabilities/deliverables-capability-factory';
import { createDiagramsCapability } from './factories/capabilities/diagrams-capability-factory';
import { createAgentCapability } from './factories/capabilities/agent-capability-factory';
import { createFeedbackCapability } from './factories/capabilities/feedback-capability-factory';
import { createAgentFilesCapability } from './factories/capabilities/agent-files-capability-factory';

/**
 * Collaborators that reach outside the process and are therefore worth
 * replacing in an isolated run (evals, integration tests). Everything else —
 * repositories, services, the agent loop — is constructed identically to
 * production so that an isolated run exercises the real code paths.
 */
export interface ApplicationOverrides {
	readonly embeddingClient?: EmbeddingClient;
	readonly reranker?: Reranker;
	readonly queryGenerator?: ISearchQueryGeneration;
	readonly attachmentStorage?: IAttachmentStorage;
	readonly referenceFinder?: ReferenceFinder;
	readonly modelCatalog?: AgentModelCatalog;
	readonly ocrEngine?: ITextRecognition;
	readonly imageDescriber?: IImageDescription;
}

export interface ApplicationConfig {
	readonly attachmentClaims: AttachmentClaims;
	readonly db: Database;
	readonly transactionRunner: TransactionRunner;
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
	readonly controllers: ProductionControllerFactory;
	readonly recoverInterruptedRuns: () => Promise<number>;
	readonly eventBus: AgentEventBus;
	/**
	 * Periodic work for the worker sidecar to run. The web process builds these
	 * like everything else and simply never starts them.
	 */
	readonly backgroundTasks: readonly ScheduledTask[];
	/**
	 * Not reachable through `ControllerFactory`, but the MCP server needs to
	 * mint a provenance row per session so tool writes are attributable.
	 */
	readonly provenance: ProvenanceRecorder;
	/** Shared so MCP's `search_tools` reuses the process-wide vector cache. */
	readonly toolRetriever: ToolRetriever;
}

/**
 * Wires the whole application graph against an explicit database and set of
 * external collaborators. `createProductionFactory` supplies these from the
 * environment; isolated runners supply a testcontainer database and cached or
 * faked external edges.
 */
export function createApplication(config: ApplicationConfig): ProductionApplication {
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
	const identity = createIdentityCapability({ db });
	const synchronization = createSyncCapability({ db, deferEmbedding });
	const projectCapability = createProjectsCapability({ db });
	const noteCapability = createNotesCapability({ db, projects: projectCapability.repository });
	const todoCapability = createTodosCapability({
		db,
		projects: projectCapability.repository,
		notes: noteCapability.repository,
		anchors: noteCapability.anchors,
		provenance: noteCapability.provenanceRepository
	});
	const relationshipCapability = createRelationshipsCapability({
		db,
		notes: noteCapability.repository,
		anchors: noteCapability.anchors,
		provenance: noteCapability.provenanceRepository,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		defaultModel: DEFAULT_GENERATION_MODEL
	});
	const referenceCapability = createReferencesCapability({
		db,
		notes: noteCapability.repository,
		anchors: noteCapability.anchors,
		provenance: noteCapability.provenanceRepository,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		defaultModel: defaultAgentModel,
		finder: overrides.referenceFinder
	});
	const suggestionCapability = createSuggestionsCapability({
		db,
		notes: noteCapability.repository,
		anchors: noteCapability.anchors,
		provenance: noteCapability.provenanceRepository
	});
	const skillCapability = createSkillsCapability({
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
	const knowledgeSearch = createKnowledgeSearchCapability({
		db,
		transactionRunner,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		embeddingClient: overrides.embeddingClient,
		reranker: overrides.reranker,
		queryGenerator: overrides.queryGenerator,
		deferEmbedding
	});
	const {
		queryGenerator,
		noteIndexer,
		diagramIndexer,
		memoryIndexer,
		lookup: knowledgeLookup,
		embeddingClient: searchEmbeddings,
		reranker: searchReranker
	} = knowledgeSearch;
	const toolRetriever = knowledgeSearch.toolRetriever;
	const agentFilesCapability = createAgentFilesCapability({
		tokens: knowledgeSearch.tokenizer,
		db,
		projects: projectRepository,
		notes: noteRepository
	});
	const widgets = createWidgetsCapability({
		db,
		projects: projectRepository,
		notes: noteRepository
	});
	const memory = createMemoryCapability({
		db,
		projects: projectRepository,
		provenance: provenanceRepository
	});
	const agentCapability = createAgentCapability({
		tokens: knowledgeSearch.tokenizer,
		db,
		controllers: () => controllerFactory,
		toolRetriever,
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
		conversations: conversationJournal,
		preferences,
		models: modelCatalog,
		toolPreferences,
		trust,
		runs: runRepository,
		runLedger: runStore,
		runEvents,
		runDecisions,
		sessions: agentSessions,
		context: agentContext,
		runner: agentRunner,
		settlements: runSettlements,
		eventBus
	} = agentCapability;
	const finalizedKnowledgeSearch = knowledgeSearch.finalize({ preferences });
	const feedback = createFeedbackCapability({ db });
	const attachmentCapability = createAttachmentsCapability({
		claims: config.attachmentClaims,
		transactionRunner,
		visionModel: defaultVisionModel,
		db,
		notes: noteRepository,
		preferences,
		indexer: knowledgeSearch.attachmentIndexer,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		mistralApiKey: config.mistralApiKey,
		mistralBaseURL: config.mistralBaseURL,
		ocrModel: config.ocrModel,
		s3: config.s3,
		storage: overrides.attachmentStorage,
		ocrEngine: overrides.ocrEngine,
		imageDescriber: overrides.imageDescriber
	});
	const attachmentStorage = attachmentCapability.storage;
	const deliverables = createDeliverablesCapability({
		db,
		storage: attachmentStorage
	});
	const templates = deliverables.templates;
	const artifacts = deliverables.artifacts;
	const relationships = relationshipCapability;
	const references = referenceCapability;
	const referenceFinder = referenceCapability.finder;
	const suggestions = suggestionCapability;
	const skills = skillCapability.services;
	const diagramCapability = createDiagramsCapability({
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
		conversations: conversationJournal,
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
		agentFiles: { reader: agentFilesCapability.reader },
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
			runEvents: eventBus,
			promiseGeneration: todoCapability.promiseGeneration,
			promiseRules: todoCapability.promiseRules
		},
		relationships: {
			selectionOrigins: noteCapability.selectionOrigins,
			knowledgeLookup,
			embeddings: searchEmbeddings,
			reranker: searchReranker,
			relationshipClassifier: relationshipCapability.classifier,
			suggestionCreator: suggestions.creator,
			transactionRunner,
			noteActionRequests: agentCapability.noteActionRequests,
			runSettlements,
			runEvents: eventBus,
			relationshipGeneration: relationshipCapability.generation,
			relationshipRules: relationshipCapability.rules
		},
		references: {
			selectionOrigins: noteCapability.selectionOrigins,
			referenceFinder,
			referenceRanker: referenceCapability.ranking,
			suggestionCreator: suggestions.creator,
			transactionRunner,
			noteActionRequests: agentCapability.noteActionRequests,
			runSettlements,
			runEvents: eventBus,
			referenceModel: referenceCapability.model
		},
		diagrams: {
			generationRules: diagramCapability.generationRules,
			diagramSourceNotes: notes.reader,
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
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
			runEvents: eventBus
		},
		diagramStudio: {
			diagramEditing: diagramCapability.editingRules,
			diagramLifecycle: diagramCapability.lifecycleRules,
			diagramSourceNotes: notes.reader,
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
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
			iconSearch: diagramCapability.iconSearch,
			canvasSource: diagramCapability.canvasSource,
			now: diagramCapability.now
		},
		suggestions: {
			todoCreationRules: todoCapability.creationRules,
			suggestionPresentation: suggestionCapability.presentation,
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
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
			now: diagramCapability.now,
			transactionRunner,
			suggestionRejecter: suggestions.rejecter,
			suggestionReverter: suggestions.reverter
		},
		agent: {
			modelSelection: agentCapability.modelSelection,
			modelChoices: agentCapability.modelChoices,
			webSearchDefaults: agentCapability.webSearchDefaults,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			conversationJournal,
			preferences,
			models: modelCatalog,
			runs: runRepository,
			cancellations: agentCapability.cancellations,
			approvals: agentCapability.approvals,
			preparation: agentCapability.preparation,
			checkpoints: agentCapability.checkpoints,
			events: runEvents,
			decisions: runDecisions,
			sessions: agentSessions,
			transactionRunner,
			defaultModel: defaultAgentModel,
			defaultVisionModel,
			runner: agentRunner,
			settlements: runSettlements,
			eventBus,
			contextFormatter: agentContext,
			contextNotes: notes.reader,
			contextSkills: skills.finder,
			contextWidgets: widgets.reader,
			contextDiagrams: diagrams.finder,
			contextAttachments: attachmentCapability.reader,
			builtInSkills: skillCapability.builtIns,
			contextMemory: memory.lister,
			contextProjects: projects.reader,
			contextConversations: conversationJournal,
			provenance
		},
		agentSettings: {
			modelSelection: agentCapability.modelSelection,
			modelChoices: agentCapability.modelChoices,
			webSearchDefaults: agentCapability.webSearchDefaults,
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
		apiTokens: { tokens: identity.apiTokens },
		toolPreferences: {
			preferences: toolPreferences,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			transactionRunner
		},
		attachments: {
			uploads: attachmentCapability.uploads,
			reader: attachmentCapability.reader,
			downloads: attachmentCapability.downloads,
			lifecycle: attachmentCapability.lifecycle,
			todoReader: todos.reader,
			transactionRunner,
			attachmentIndexer: knowledgeSearch.attachmentIndexer
		},
		deliverables: {
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			templates,
			templateStorage: deliverables.templateStorage,
			templateStyles: deliverables.templateStyles,
			noteReader: notes.reader,
			provenanceRecorder: provenance,
			artifactWriter: artifacts,
			artifactStorage: deliverables.artifactStorage,
			attachmentDownloader: attachmentCapability.downloads,
			fetchImage: deliverables.fetchImage,
			prepareExport: deliverables.prepareExport,
			exportImageSources: deliverables.exportImageSources,
			exportDiagramReferences: deliverables.exportDiagramReferences,
			exportWidgetReferences: deliverables.exportWidgetReferences,
			widgetReader: widgets.reader,
			todoLister: todos.lister,
			noteLister: notes.treeReader,
			diagramReader: diagrams.finder,
			diagramRenderer: deliverables.diagramRenderer,
			docxGenerator: deliverables.docxGenerator,
			pdfGenerator: deliverables.pdfGenerator,
			zipPacker: deliverables.zipPacker,
			exportSettingsReader: artifacts,
			exportSettingsWriter: artifacts,
			artifactLister: artifacts,
			artifactReader: artifacts,
			artifactDeleter: artifacts,
			transactionRunner
		},
		skills: {
			skillPortability: skillCapability.portability,
			skillMetadataEditing: skillCapability.metadataEditing,
			noteReferences: noteCapability.references,
			noteCreationRules: noteCapability.creationRules,
			noteEditingRules: noteCapability.editingRules,
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
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
			writeRecovery: synchronization.mutations,
			syncObjects: synchronization.objects,
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
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
			markdown: noteCapability.markdown,
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
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
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
			catalogReader: widgets.catalogReader,
			editing: widgets.editing,
			lifecycle: widgets.lifecycle,
			catalog: widgets.catalog,
			search: widgets.search,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			widgetReader: widgets.reader,
			widgetLister: widgets.lister,
			widgetWriter: widgets.writer,
			widgetIndexer: knowledgeSearch.widgetIndexer,
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
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
			knowledgeLookup,
			embeddings: searchEmbeddings,
			reranker: searchReranker,
			queryGenerator,
			conversations: conversationJournal
		},
		inlineSuggestions: {
			context: finalizedKnowledgeSearch.inlineContext,
			noteReader: notes.reader,
			preferences: finalizedKnowledgeSearch.preferences,
			inlineCompletionGenerator: finalizedKnowledgeSearch.inlineCompletion,
			knowledgeLookup,
			embeddings: searchEmbeddings,
			reranker: searchReranker,
			memory: memory.lister,
			observer: finalizedKnowledgeSearch.observer,
			// Controllers are constructed per request, so the process-wide spend
			// guard is wired once here.
			inlineSuggestionThrottle: finalizedKnowledgeSearch.inlineAdmission
		},
		feedback
	};
	const controllerFactory = new ProductionControllerFactory(dependencies);
	return {
		controllers: controllerFactory,
		mcpSurface: agentCapability.mcpSurface,
		recoverInterruptedRuns: async () => {
			const interrupted = await controllerFactory.agent().recoverInterruptedRuns();
			return (
				interrupted +
				(await controllerFactory.todos().recoverQueuedPromiseRuns()) +
				(await controllerFactory.references().recoverQueuedReferenceRuns()) +
				(await controllerFactory.relationships().recoverQueuedRelatedNoteRuns()) +
				(await controllerFactory.diagrams().recoverQueuedDiagramRuns())
			);
		},
		backgroundTasks: [
			knowledgeSearch.maintenance,
			attachmentCapability.retention,
			attachmentCapability.objectRemoval,
			attachmentCapability.processing
		],
		eventBus,
		provenance,
		toolRetriever
	};
}
