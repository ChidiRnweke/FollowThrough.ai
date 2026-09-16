import {
	ProductionControllerFactory,
	type ProductionControllerDependencies
} from '$lib/server/factories/production-controller-factory';
import type { AgentModelCatalog } from './services/agent/runs/preferences';
import type { ProvenanceRecorder } from './services/notes/provenance';
import type { ToolRetriever } from './controllers/tool-discovery/controller';
import type { ITextRecognition } from './services/attachments/mistral-ocr';
import type { IImageDescription } from './services/attachments/image-description';
import type { AttachmentClaims } from './services/attachments/contracts';
import type { EmbeddingClient } from './services/knowledge-search/contracts';
import type { ISearchQueryGeneration } from './services/knowledge-search/query-generation';
import type { Reranker } from './services/knowledge-search/contracts';
import type { ReferenceFinder } from './services/references/contracts';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import type { Database } from './db';
import { DEFAULT_GENERATION_MODEL, DEFAULT_LANGUAGE_MODEL_BASE_URL } from './config';
import type { IAttachmentStorage, ObjectStorageConfig } from './services/attachments/storage';
import type { AgentEventBus } from './services/agent/runs/events';
import type { ScheduledTask } from './services/scheduler';
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
	const projects = projectCapability.catalog;
	const noteRepository = noteCapability.repository;
	const anchorRepository = noteCapability.anchors;
	const provenanceRepository = noteCapability.provenanceRepository;
	const notes = noteCapability.catalog;
	const provenance = noteCapability.provenance;
	const todos = todoCapability.catalog;
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
		db,
		projects: projectRepository,
		notes: noteRepository
	});
	const memory = createMemoryCapability({
		db,
		projects: projectRepository,
		provenance: provenanceRepository
	}).library;
	const agentCapability = createAgentCapability({
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
	const attachments = attachmentCapability.library;
	const deliverables = createDeliverablesCapability({
		db,
		storage: attachmentStorage
	});
	const templates = deliverables.templates;
	const artifacts = deliverables.artifacts;
	const relationships = relationshipCapability.graph;
	const references = referenceCapability.library;
	const referenceFinder = referenceCapability.finder;
	const suggestions = suggestionCapability.inbox;
	const skills = skillCapability.library;
	const diagramCapability = createDiagramsCapability({
		contextNotes: notes,
		contextSkills: skills,
		contextMemory: memory,
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
	const diagrams = diagramCapability.library;
	const diagramTransforms = diagramCapability.transforms;
	const dependencies: ProductionControllerDependencies = {
		agentFiles: { reader: agentFilesCapability.reader },
		todos: {
			todoBatchReceipts: todoCapability.batchReceipts,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			todoLister: todos,
			todoViewAssembler: todos,
			todoReader: todos,
			todoEditor: todos,
			todoDeleter: todos,
			selectionOrigins: noteCapability.selectionOrigins,
			promiseExtractor: todoCapability.promiseExtractor,
			suggestionCreator: suggestions,
			trustPolicyEvaluator: trust,
			todoCreator: todos,
			suggestionAccepter: suggestions,
			suggestionEffects: suggestionCapability.effects,
			transactionRunner,
			projectLister: projects,
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
			suggestionCreator: suggestions,
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
			suggestionCreator: suggestions,
			transactionRunner,
			noteActionRequests: agentCapability.noteActionRequests,
			runSettlements,
			runEvents: eventBus,
			referenceModel: referenceCapability.model
		},
		diagrams: {
			diagramSourceNotes: notes,
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
			anchorCreator: notes,
			generation: diagramCapability.generation,
			suggestionCreator: suggestions,
			transactionRunner,
			diagramFinder: diagrams,
			mermaidValidator: diagramCapability.mermaidValidator,
			now: diagramCapability.now,
			drawioXmlValidator: diagramCapability.xmlValidator,
			drawioSvgSanitizer: diagramCapability.svgSanitizer,
			mermaidRenderer: diagramTransforms,
			textExtractor: diagramTransforms,
			drawioTextExtractor: diagramCapability.textExtractor,
			diagramWriter: diagrams,
			diagramIndexer,
			noteActionRequests: agentCapability.noteActionRequests,
			runSettlements,
			runEvents: eventBus
		},
		diagramStudio: {
			diagramSourceNotes: notes,
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			transactionRunner,
			diagramFinder: diagrams,
			diagramLister: diagrams,
			diagramConversations: diagrams,
			diagramReferences: diagrams,
			diagramRenamer: diagrams,
			diagramDraftWriter: diagrams,
			diagramRevisionReader: diagrams,
			diagramDeleter: diagrams,
			diagramArchiver: diagrams,
			diagramWriter: diagrams,
			diagramIndexer,
			drawioXmlValidator: diagramCapability.xmlValidator,
			drawioSvgSanitizer: diagramCapability.svgSanitizer,
			drawioTextExtractor: diagramCapability.textExtractor,
			iconSearch: diagramCapability.iconSearch,
			canvasSource: diagramCapability.canvasSource,
			now: diagramCapability.now
		},
		suggestions: {
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
			suggestionLister: suggestions,
			suggestionExpirer: suggestions,
			suggestionViewAssembler: suggestions,
			suggestionFinder: suggestions,
			suggestionAccepter: suggestions,
			suggestionEffects: suggestionCapability.effects,
			todoCreator: todos,
			relationshipCreator: relationships,
			referenceCreator: references,
			memoryChanges: memory,
			sourceNotes: notes,
			drawioLabels: diagramCapability.suggestionLabels,
			memoryIndexer,
			diagramIndexer,
			diagramWriter: diagrams,
			drawioXmlValidator: diagramCapability.xmlValidator,
			drawioSvgSanitizer: diagramCapability.svgSanitizer,
			drawioTextExtractor: diagramCapability.textExtractor,
			now: diagramCapability.now,
			transactionRunner,
			suggestionRejecter: suggestions,
			suggestionReverter: suggestions
		},
		agent: {
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			conversationJournal,
			preferences,
			models: modelCatalog,
			runs: runRepository,
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
			contextNotes: notes,
			contextSkills: skills,
			builtInSkills: skillCapability.builtIns,
			contextMemory: memory,
			contextProjects: projects,
			contextConversations: conversationJournal,
			provenance
		},
		agentSettings: {
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
			attachments,
			transactionRunner,
			attachmentIndexer: knowledgeSearch.attachmentIndexer
		},
		deliverables: {
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			templates,
			templateStorage: deliverables.templateStorage,
			templateStyles: deliverables.templateStyles,
			noteReader: notes,
			provenanceRecorder: provenance,
			artifactWriter: artifacts,
			artifactStorage: deliverables.artifactStorage,
			attachmentDownloader: attachments,
			fetchImage: deliverables.fetchImage,
			prepareExport: deliverables.prepareExport,
			exportImageSources: deliverables.exportImageSources,
			exportDiagramReferences: deliverables.exportDiagramReferences,
			diagramReader: diagrams,
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
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			skillFinder: skills,
			builtInSkills: skillCapability.builtIns,
			skillUsageLister: skills,
			skillUsageRecorder: skills,
			revisionRecorder: notes,
			noteEditor: notes,
			revisionReader: notes,
			attachmentRestorer: notes,
			anchorRepairer: notes,
			noteIndexer,
			noteLinkReconciler: relationships,
			skillEditor: skills,
			selectionOrigins: noteCapability.selectionOrigins,
			skillCreator: skills,
			noteCreator: notes,
			transactionRunner
		},
		workspace: {
			syncChanges: synchronization.changes,
			writeRecovery: synchronization.mutations,
			syncObjects: synchronization.objects,
			userReader: identity.userReader,
			projectLister: projects,
			noteTreeReader: notes,
			skillFinder: skills,
			builtInSkills: skillCapability.builtIns,
			transactionRunner,
			suggestionLister: suggestions,
			suggestionExpirer: suggestions,
			todoLister: todos,
			waitingOnFinder: todos,
			todoViewAssembler: todos
		},
		notes: {
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
			folderCreator: projects,
			markdown: noteCapability.markdown,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			noteReader: notes,
			noteTreeReader: notes,
			noteTextSearcher: notes,
			noteCreator: notes,
			noteSectionNumbering: notes,
			projectReader: projects,
			userPreferences: identity.userPreferences,
			relationshipFinder: relationships,
			backlinkViewAssembler: relationships,
			noteLinkReconciler: relationships,
			referenceLister: references,
			referenceViewAssembler: references,
			diagramLister: diagrams,
			todoLister: todos,
			todoViewAssembler: todos,
			suggestionLister: suggestions,
			suggestionExpirer: suggestions,
			suggestionViewAssembler: suggestions,
			noteEditor: notes,
			noteArchiver: notes,
			noteTrashReader: notes,
			notePurger: notes,
			attachmentRestorer: notes,
			notePublisher: notes,
			revisionRecorder: notes,
			revisionReader: notes,
			anchorRepairer: notes,
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
			indexEmbeddings: knowledgeSearch.embeddingClient,
			indexWriter: knowledgeSearch.indexWriter,
			memoryIndexer,
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			memoryLister: memory,
			memoryCreator: memory,
			memoryEditor: memory,
			memoryDeleter: memory,
			memoryChanges: memory,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			suggestionAccepter: suggestions,
			suggestionEffects: suggestionCapability.effects,
			trustPolicyEvaluator: trust,
			transactionRunner
		},
		projects: {
			syncMutations: synchronization.mutations,
			syncRetry: synchronization.mutationRetry,
			projectCreator: projects,
			projectReader: projects,
			projectLister: projects,
			projectEditor: projects,
			projectTreeReader: projects,
			folderCreator: projects,
			entryMover: projects,
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
			noteReader: notes,
			preferences: finalizedKnowledgeSearch.preferences,
			inlineCompletionGenerator: finalizedKnowledgeSearch.inlineCompletion,
			knowledgeLookup,
			embeddings: searchEmbeddings,
			reranker: searchReranker,
			memory,
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
			attachmentCapability.processing
		],
		eventBus,
		provenance,
		toolRetriever
	};
}
