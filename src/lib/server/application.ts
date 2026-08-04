import {
	ProductionControllerFactory,
	type ProductionControllerDependencies
} from '$lib/server/production-controller-factory';
import type { AgentModelCatalog } from './services/agent/runs/preferences';
import type { ProvenanceRecorder } from './services/notes/provenance';
import type { ToolRetriever } from './services/agent/tools/tool-retriever';
import type { ImageDescriber, OcrEngineClient } from './services/attachments/content';
import type { DocumentOcr } from './services/attachments/contracts';
import type { Condenser, EmbeddingClient } from './services/knowledge-search/contracts';
import type { Reranker } from './services/knowledge-search/semantic';
import type { ReferenceFinder } from './services/references/contracts';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import type { Database } from './db';
import { DEFAULT_GENERATION_MODEL, DEFAULT_LANGUAGE_MODEL_BASE_URL } from './config';
import type { IAttachmentStorage, ObjectStorageConfig } from './services/attachments/storage';
import type { AgentEventBus } from './services/agent/runs/events';
import type { ScheduledTask } from './services/scheduler';
import { createIdentityCapability } from './identity-capability-factory';
import { createProjectsCapability } from './projects-capability-factory';
import { createNotesCapability } from './notes-capability-factory';
import { createReferencesCapability } from './references-capability-factory';
import { createRelationshipsCapability } from './relationships-capability-factory';
import { createTodosCapability } from './todos-capability-factory';
import { createSuggestionsCapability } from './suggestions-capability-factory';
import { createKnowledgeSearchCapability } from './knowledge-search-capability-factory';
import { createSkillsCapability } from './skills-capability-factory';
import { createMemoryCapability } from './memory-capability-factory';
import { createAttachmentsCapability } from './attachments-capability-factory';
import { createDeliverablesCapability } from './deliverables-capability-factory';
import { createDiagramsCapability } from './diagrams-capability-factory';
import { createAgentCapability } from './agent-capability-factory';
import { createFeedbackCapability } from './feedback-capability-factory';

/**
 * Collaborators that reach outside the process and are therefore worth
 * replacing in an isolated run (evals, integration tests). Everything else —
 * repositories, services, the agent loop — is constructed identically to
 * production so that an isolated run exercises the real code paths.
 */
export interface ApplicationOverrides {
	readonly embeddingClient?: EmbeddingClient;
	readonly reranker?: Reranker;
	readonly condenser?: Condenser;
	readonly attachmentStorage?: IAttachmentStorage;
	readonly referenceFinder?: ReferenceFinder;
	readonly modelCatalog?: AgentModelCatalog;
	readonly ocrEngine?: OcrEngineClient;
	readonly imageDescriber?: ImageDescriber;
	readonly documentOcr?: DocumentOcr;
}

export interface ApplicationConfig {
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
	// Attachment indexing is deliberately left inline: it already runs off the
	// request path, and deferring it would report an attachment "ready" before it
	// was actually retrievable.
	const deferEmbedding = config.deferEmbedding ?? false;
	const identity = createIdentityCapability({ db });
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
		provenance: noteCapability.provenanceRepository
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
		notes,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		embeddingClient: overrides.embeddingClient,
		reranker: overrides.reranker,
		condenser: overrides.condenser,
		deferEmbedding
	});
	const {
		repository: searchRepository,
		condenser,
		noteIndexer,
		diagramIndexer,
		memoryIndexer,
		searcher: knowledgeSearcher,
		linkFinder
	} = knowledgeSearch;
	const toolRetriever = knowledgeSearch.toolRetriever;
	const memory = createMemoryCapability({
		db,
		projects: projectRepository,
		provenance: provenanceRepository,
		indexer: memoryIndexer
	}).library;
	const agentCapability = createAgentCapability({
		db,
		transactionRunner,
		controllers: () => controllerFactory,
		toolRetriever,
		notes,
		skills: skillCapability.provisioned,
		projects,
		memory,
		provenance,
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
		executor,
		eventBus
	} = agentCapability;
	const finalizedKnowledgeSearch = knowledgeSearch.finalize({ preferences, memory });
	const feedback = createFeedbackCapability({ db });
	const attachmentCapability = createAttachmentsCapability({
		db,
		notes: noteRepository,
		preferences,
		searchRepository,
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
		imageDescriber: overrides.imageDescriber,
		documentOcr: overrides.documentOcr
	});
	const attachmentRepository = attachmentCapability.repository;
	const attachmentStorage = attachmentCapability.storage;
	const attachments = attachmentCapability.library;
	const deliverables = createDeliverablesCapability({
		db,
		storage: attachmentStorage,
		transactionRunner,
		provenance,
		notes,
		todos,
		projects
	});
	const templates = deliverables.templates;
	const artifacts = deliverables.artifacts;
	const relationships = relationshipCapability.graph;
	const references = referenceCapability.library;
	const referenceFinder = referenceCapability.finder;
	const suggestions = suggestionCapability.inbox;
	const suggestionLister = suggestionCapability.lister;
	const skills = skillCapability.library;
	const provisionedSkills = skillCapability.provisioned;
	const diagramCapability = createDiagramsCapability({
		db,
		notes: noteRepository,
		anchors: anchorRepository,
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
		indexer: diagramIndexer
	});
	const diagrams = diagramCapability.library;
	const diagramTransforms = diagramCapability.transforms;
	const diagramAgent = diagramCapability.authoring;
	const artifactApplier = suggestionCapability.finalize({
		todoCreator: todos,
		relationshipCreator: relationships,
		referenceCreator: references,
		diagramWriter: diagrams,
		todoDeleter: todos,
		relationshipDeleter: relationships,
		referenceDeleter: references,
		diagramDeleter: diagrams,
		memoryChangeApplier: memory,
		drawioValidator: diagramCapability.suggestionValidator,
		drawioLabels: diagramCapability.suggestionLabels
	});
	const drawioReview = diagramCapability.review;
	const dependencies: ProductionControllerDependencies = {
		todos: {
			todoLister: todos,
			todoViewAssembler: todos,
			todoReader: todos,
			todoEditor: todos,
			todoDeleter: todos,
			todoStatusChanger: todos,
			anchorCreator: notes,
			promiseExtractor: todoCapability.promiseExtractor,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			trustPolicyEvaluator: trust,
			todoCreator: todos,
			suggestionAccepter: suggestions,
			noteReader: notes,
			transactionRunner,
			boardPdfExporter: deliverables.boardPdfExporter,
			workflowRunner: agentCapability.workflowRunner
		},
		relationships: {
			anchorCreator: notes,
			linkFinder,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner,
			workflowRunner: agentCapability.workflowRunner
		},
		references: {
			anchorCreator: notes,
			referenceFinder,
			referenceRanker: references,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner,
			workflowRunner: agentCapability.workflowRunner
		},
		diagrams: {
			anchorCreator: notes,
			mermaidCreator: diagramAgent,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner,
			diagramFinder: diagrams,
			mermaidReviser: diagramAgent,
			inlineMermaidReviser: diagramAgent,
			inlineMermaidToDrawioConverter: diagramAgent,
			drawioXmlValidator: diagramCapability.xmlValidator,
			drawioSvgSanitizer: diagramCapability.svgSanitizer,
			mermaidRenderer: diagramTransforms,
			textExtractor: diagramTransforms,
			drawioTextExtractor: diagramCapability.textExtractor,
			diagramWriter: diagrams,
			diagramIndexer,
			drawioCreator: diagramAgent,
			workflowRunner: agentCapability.workflowRunner
		},
		suggestions: {
			suggestionLister,
			suggestionViewAssembler: suggestions,
			suggestionFinder: suggestions,
			suggestionAccepter: suggestions,
			artifactApplier,
			drawioReviewSaver: drawioReview,
			transactionRunner,
			suggestionRejecter: suggestions,
			suggestionReverter: suggestions
		},
		agent: {
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
			executor
		},
		agentSettings: { preferences, models: modelCatalog },
		apiTokens: { tokens: identity.apiTokens },
		toolPreferences: { preferences: toolPreferences },
		attachments: { attachments, transactionRunner },
		deliverables: {
			templateUploader: templates,
			templateLister: templates,
			templateDeleter: templates,
			documentGenerator: artifacts,
			documentPreviewer: artifacts,
			exportSettingsReader: artifacts,
			exportSettingsWriter: artifacts,
			artifactLister: artifacts,
			artifactReader: artifacts,
			artifactDeleter: artifacts,
			artifactRegenerator: artifacts,
			transactionRunner
		},
		skills: {
			skillFinder: provisionedSkills,
			skillUsageLister: skills,
			skillUsageRecorder: skills,
			skillVersionManager: skills,
			skillEditor: skills,
			anchorCreator: notes,
			skillCreator: skills,
			noteCreator: notes,
			provenanceRecorder: provenance,
			transactionRunner
		},
		workspace: {
			userReader: identity.userReader,
			projectLister: projects,
			noteTreeReader: notes,
			skillFinder: provisionedSkills,
			suggestionLister,
			todoLister: todos,
			waitingOnFinder: todos,
			todoViewAssembler: todos
		},
		notes: {
			noteReader: notes,
			noteTreeReader: notes,
			noteCreator: notes,
			relationshipFinder: relationships,
			backlinkViewAssembler: relationships,
			noteLinkReconciler: relationships,
			referenceLister: references,
			referenceViewAssembler: references,
			diagramLister: diagrams,
			todoLister: todos,
			todoViewAssembler: todos,
			suggestionLister,
			suggestionViewAssembler: suggestions,
			noteEditor: notes,
			noteArchiver: notes,
			notePublisher: notes,
			revisionRecorder: notes,
			revisionReader: notes,
			anchorRepairer: notes,
			noteIndexer,
			transactionRunner
		},
		trustPolicies: { trustPolicyStore: trust },
		memory: {
			memoryLister: memory,
			memoryCreator: memory,
			memoryEditor: memory,
			memoryDeleter: memory,
			memoryChangeApplier: memory,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			suggestionAccepter: suggestions,
			trustPolicyEvaluator: trust,
			transactionRunner
		},
		projects: {
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
			knowledgeSearcher,
			condenser,
			conversations: conversationJournal
		},
		inlineSuggestions: {
			noteReader: notes,
			preferences: finalizedKnowledgeSearch.preferences,
			inlineCompletionGenerator: finalizedKnowledgeSearch.inlineCompletion,
			inlineCompletionContextBuilder: finalizedKnowledgeSearch.inlineContext,
			// Controllers are constructed per request, so the process-wide spend
			// guard is wired once here.
			inlineSuggestionThrottle: finalizedKnowledgeSearch.inlineAdmission
		},
		feedback
	};
	const controllerFactory = new ProductionControllerFactory(dependencies);
	return {
		controllers: controllerFactory,
		recoverInterruptedRuns: async () =>
			(await runRepository.recoverInterrupted('Process restarted')) +
			(await attachmentRepository.failInterrupted()),
		backgroundTasks: [knowledgeSearch.maintenance, attachmentCapability.retention],
		eventBus,
		provenance,
		toolRetriever
	};
}
