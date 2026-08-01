import {
	ProductionControllerFactory,
	type ProductionControllerDependencies
} from '$lib/server/production-controller-factory';
import { OpenRouter } from '@openrouter/sdk';
import { ConversationArchive } from './services/agent/conversations/archive';
import { AgentRunLedger } from './services/agent/runs/ledger';
import {
	AgentModels,
	AgentPreferenceCatalog,
	type AgentModelCatalog
} from './services/agent/runs/preferences';
import { normalizeLanguageModelId } from '$lib/models/agent';
import type { ProvenanceRecorder } from './services/notes/provenance';
import { ToolTrust } from './services/agent/runs/tool-trust';
import { ToolAccess } from './services/agent/tools/preferences';
import { EmbeddedToolRetriever, type ToolRetriever } from './services/agent/tools/tool-retriever';
import {
	AttachmentContent,
	type ImageDescriber,
	type OcrEngineClient
} from './services/attachments/content';
import type { DocumentOcr } from './services/attachments/contracts';
import { AttachmentLibrary } from './services/attachments/library';
import { DiagramContent } from './services/diagrams/content';
import { DiagramLibrary } from './services/diagrams/library';
import { UserDirectory } from './services/identity/users';
import type { Condenser } from './services/knowledge-search/contracts';
import {
	EmbeddedAttachmentIndexer,
	EmbeddedDiagramIndexer,
	EmbeddedMemoryIndexer,
	EmbeddedNoteIndexer,
	retrievalChunkerFromEnv
} from './services/knowledge-search/indexing';
import type { EmbeddingClient } from './services/knowledge-search/contracts';
import {
	EmbeddedKnowledgeSearcher,
	ProjectScopedLinkFinder,
	RerankingKnowledgeSearcher,
	type Reranker
} from './services/knowledge-search/semantic';
import { MemoryLibrary } from './services/memory/library';
import { NoteCatalog } from './services/notes/catalog';
import { NoteProvenance } from './services/notes/provenance';
import { ProjectCatalog } from './services/projects/catalog';
import type { ReferenceFinder } from './services/references/contracts';
import { ReferenceLibrary } from './services/references/library';
import { RelationshipGraph } from './services/relationships/graph';
import { BuiltInSkillLibrary, BuiltInSkills } from './services/skills/built-ins';
import { SkillLibrary } from './services/skills/library';
import { ExpiringSuggestionLister } from './services/suggestions/expiring-lister';
import { SuggestionInbox } from './services/suggestions/inbox';
import { TodoCatalog } from './services/todos/catalog';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import type { Database } from './db';
import { BaseAgentContext } from './services/agent/runs/base-context';
import { SuggestionApplication } from './services/suggestions/application';
import { PromiseDiscovery } from './services/todos/promise-discovery';
import { DeterministicPromiseExtractor } from './services/todos/promise-rules';
import { ReferenceDiscovery } from './services/references/discovery';
import { AgentReasoning, AgentToolEventMapper } from './services/agent/runs/reasoning';
import { resolveAgentModel } from './services/agent/runs/preferences';
import { agentToolRegistry } from './agent-tool-factory';
import { BUILT_INS, RETIRED_BUILT_INS } from './services/skills/built-in-definitions';
import { SkillManifestCodec } from './services/skills/manifest';
import { extractTemplateStyles } from './services/deliverables/template-styles';
import { DiagramAuthoring } from './services/diagrams/authoring';
import { DrawioReview } from './services/diagrams/review';
import { Embeddings } from './services/knowledge-search/embeddings';
import {
	DEFAULT_GENERATION_MODEL,
	DEFAULT_LANGUAGE_MODEL_BASE_URL,
	DEFAULT_MISTRAL_BASE_URL,
	DEFAULT_OCR_MODEL,
	optionalProperty,
	positiveNumberFromEnvironment
} from './config';
import { InlineSuggestionCompletion } from './services/inline-suggestions/inline-completion';
import { InlineSuggestionContext } from './services/inline-suggestions/inline-context';
import { InlineSuggestionAdmission } from './services/inline-suggestions/inline-admission';
import { SearchRanking } from './services/knowledge-search/ranking';
import { MistralOcr } from './services/attachments/mistral-ocr';
import { ImageDescription } from './services/attachments/image-description';
import { ConversationSummary } from './services/agent/conversations/summary';
import { KnowledgeIndexRecords } from './repositories/knowledge-search/postgres/search';
import { ConversationRecords } from './repositories/agent/postgres/conversations';
import { AgentContext } from './services/agent/runs/context';
import { AccessTokens } from '$lib/server/services/identity/api-tokens';
import { ApiTokenRecords } from './repositories/identity/postgres/api-tokens';
import {
	AttachmentParserRegistry,
	AttachmentStorage,
	type IAttachmentStorage,
	type ObjectStorageConfig
} from './services/attachments/storage';
import { RelationshipDiscovery } from './services/relationships/discovery';
import { ProjectRecords } from './repositories/projects/postgres/projects';
import { UserRecords } from './repositories/identity/postgres/users';
import { NoteRecords, SourceAnchorRecords } from './repositories/notes/postgres/notes';
import { ProvenanceRecords } from './repositories/provenance/postgres/provenance';
import { TodoRecords } from './repositories/todos/postgres/todos';
import { SuggestionRecords } from './repositories/suggestions/postgres/suggestions';
import { TrustPolicyRecords } from './repositories/agent/postgres/trust-policies';
import { MemoryRecords } from './repositories/memory/postgres/memory-entries';
import { ExportSettingsRecords } from './repositories/deliverables/postgres/export-settings';
import { RelationshipRecords } from './repositories/relationships/postgres/relationships';
import { ReferenceRecords } from './repositories/references/postgres/references';
import { DiagramRecords } from './repositories/diagrams/postgres/diagrams';
import { SkillRecords } from './repositories/skills/postgres/skills';
import { AttachmentRecords } from './repositories/attachments/postgres/attachments';
import { TemplateRecords } from './repositories/deliverables/postgres/templates';
import { ArtifactRecords } from './repositories/deliverables/postgres/artifacts';
import { DocumentTemplates } from '$lib/server/services/deliverables/templates';
import { ArtifactLibrary } from '$lib/server/services/deliverables/artifacts';
import { agentToolCatalog } from './agent-tool-catalog-factory';
import { generateDocx } from './services/deliverables/docx';
import { generatePdf } from './services/deliverables/pdf';
import {
	AgentPreferenceRecords,
	AgentRunRecords,
	AgentSessionRecords
} from './repositories/agent/postgres/agent-settings';
import { ToolPreferenceRecords } from './repositories/agent/postgres/tool-preferences';
import {
	AgentRunDecisionRecords,
	AgentRunEventRecords
} from './repositories/agent/postgres/agent-runs';
import { AgentRunLifecycle } from './services/agent/runs/lifecycle';
import { AgentEvents, type AgentEventBus } from './services/agent/runs/events';
import {
	DrawioLabelExtractor,
	DrawioSvgSanitizer,
	DrawioXmlValidator,
	DrawioDiagramTextExtractor
} from './services/diagrams/drawio';
import type { ScheduledTask } from './services/scheduler';
import { KnowledgeIndexMaintenance } from './services/knowledge-search/index-maintenance';
import { UploadRetention } from './services/attachments/retention';
import { FeedbackRecords } from './repositories/feedback/postgres/feedback';
import { operationObserver, traceAgentTurn, traceWorkflow } from './services/telemetry';
import { webSearchOptionsFromEnvironment } from '$lib/models/agent';
import { ConversationBuffer } from './services/agent/conversations/buffer';

class LateValue<T> {
	private value!: T;

	set(value: T): void {
		this.value = value;
	}

	get(): T {
		return this.value;
	}
}

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

	const projectRepository = new ProjectRecords(db);
	const userReader = new UserDirectory(new UserRecords(db));
	const projects = new ProjectCatalog(projectRepository, projectRepository);
	const noteRepository = new NoteRecords(db);
	const anchorRepository = new SourceAnchorRecords(db);
	const provenanceRepository = new ProvenanceRecords(db);
	const notes = new NoteCatalog(noteRepository, anchorRepository, projectRepository);
	const provenance = new NoteProvenance(provenanceRepository, anchorRepository);
	const todos = new TodoCatalog(
		new TodoRecords(db),
		projectRepository,
		anchorRepository,
		noteRepository,
		provenanceRepository
	);
	const searchRepository = new KnowledgeIndexRecords(db);
	const conversationJournal = new ConversationArchive(new ConversationRecords(db));
	const preferences = new AgentPreferenceCatalog(new AgentPreferenceRecords(db));
	const apiTokenService = new AccessTokens(new ApiTokenRecords(db));
	const toolPreferences = new ToolAccess(new ToolPreferenceRecords(db), agentToolCatalog);
	const runRepository = new AgentRunRecords(db);
	const runStore = new AgentRunLedger(runRepository);
	const runEvents = new AgentRunEventRecords(db);
	const runDecisions = new AgentRunDecisionRecords(db);
	const agentSessions = new AgentSessionRecords(db);
	const attachmentStorage =
		overrides.attachmentStorage ??
		new AttachmentStorage(
			config.s3 ?? {
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				accessKeyId: 'followthrough',
				secretAccessKey: 'followthrough-local-secret',
				bucket: 'followthrough-attachments',
				forcePathStyle: true
			}
		);
	const templateRepository = new TemplateRecords(db);
	const artifactRepository = new ArtifactRecords(db);
	const templates = new DocumentTemplates(
		attachmentStorage,
		templateRepository,
		transactionRunner,
		extractTemplateStyles
	);
	const artifacts = new ArtifactLibrary(
		artifactRepository,
		attachmentStorage,
		generateDocx,
		generatePdf,
		provenance,
		notes,
		templateRepository,
		transactionRunner,
		new ExportSettingsRecords(db)
	);
	const modelCatalog =
		overrides.modelCatalog ??
		new AgentModels(
			new OpenRouter({
				apiKey: openRouterApiKey,
				httpReferer: appURL,
				xTitle: 'FollowThrough'
			}),
			new Set((config.recommendedModels ?? []).map(normalizeLanguageModelId))
		);
	const embeddingClient =
		overrides.embeddingClient ??
		new Embeddings(openRouterApiKey, {
			baseURL: openRouterBaseURL,
			appURL,
			observer: operationObserver
		});
	const reranker =
		overrides.reranker ??
		new SearchRanking(openRouterApiKey, {
			baseURL: openRouterBaseURL,
			appURL,
			observer: operationObserver
		});
	const condenser =
		overrides.condenser ??
		new ConversationSummary(openRouterApiKey, {
			baseURL: openRouterBaseURL,
			appURL,
			observer: operationObserver
		});
	const toolRetriever = new EmbeddedToolRetriever(embeddingClient);
	const attachmentRepository = new AttachmentRecords(db);
	const retrievalChunker = retrievalChunkerFromEnv();
	// OCR runs on Mistral Document AI, not OpenRouter.
	const ocrEngine =
		overrides.ocrEngine ??
		new MistralOcr(config.mistralApiKey, {
			baseURL: config.mistralBaseURL ?? DEFAULT_MISTRAL_BASE_URL,
			model: config.ocrModel ?? DEFAULT_OCR_MODEL,
			observer: operationObserver
		});
	const imageDescriber =
		overrides.imageDescriber ??
		new ImageDescription(openRouterApiKey, { baseURL: openRouterBaseURL, appURL });
	const documentOcr = overrides.documentOcr ?? new AttachmentContent(ocrEngine, imageDescriber);
	const attachments = new AttachmentLibrary(
		attachmentRepository,
		noteRepository,
		attachmentStorage,
		new AttachmentParserRegistry(),
		documentOcr,
		imageDescriber,
		searchRepository,
		new EmbeddedAttachmentIndexer(searchRepository, embeddingClient, retrievalChunker),
		preferences
	);
	const noteIndexer = new EmbeddedNoteIndexer(
		searchRepository,
		embeddingClient,
		retrievalChunker,
		deferEmbedding
	);
	const diagramIndexer = new EmbeddedDiagramIndexer(
		searchRepository,
		embeddingClient,
		notes,
		retrievalChunker,
		deferEmbedding
	);
	const embeddedKnowledgeSearcher = new EmbeddedKnowledgeSearcher(
		searchRepository,
		embeddingClient
	);
	const knowledgeSearcher = new RerankingKnowledgeSearcher(embeddedKnowledgeSearcher, reranker);
	const linkFinder = new ProjectScopedLinkFinder(
		notes,
		knowledgeSearcher,
		new RelationshipDiscovery({ observer: operationObserver })
	);
	const relationships = new RelationshipGraph(
		new RelationshipRecords(db),
		noteRepository,
		anchorRepository,
		provenanceRepository
	);
	const references = new ReferenceLibrary(
		new ReferenceRecords(db),
		noteRepository,
		anchorRepository,
		provenanceRepository
	);
	const referenceFinder =
		overrides.referenceFinder ??
		new ReferenceDiscovery({
			apiKey: openRouterApiKey,
			baseURL: openRouterBaseURL,
			appURL,
			defaultModel: normalizeLanguageModelId(defaultAgentModel),
			observer: operationObserver
		});
	const suggestions = new SuggestionInbox(
		new SuggestionRecords(db),
		noteRepository,
		provenanceRepository,
		anchorRepository
	);
	const suggestionLister = new ExpiringSuggestionLister(suggestions, suggestions);
	const trust = new ToolTrust(new TrustPolicyRecords(db));
	const diagrams = new DiagramLibrary(
		new DiagramRecords(db),
		noteRepository,
		anchorRepository,
		provenanceRepository
	);
	const diagramTransforms = new DiagramContent();
	const skillRepository = new SkillRecords(db);
	const skills = new SkillLibrary(
		skillRepository,
		noteRepository,
		provenanceRepository,
		new SkillManifestCodec()
	);
	const builtInSkills = new BuiltInSkills(projectRepository, noteRepository, skillRepository, {
		active: BUILT_INS,
		retired: RETIRED_BUILT_INS
	});
	const provisionedSkills = new BuiltInSkillLibrary(builtInSkills, skills);
	const memoryIndexer = new EmbeddedMemoryIndexer(
		searchRepository,
		embeddingClient,
		retrievalChunker,
		deferEmbedding
	);
	const memory = new MemoryLibrary(
		new MemoryRecords(db),
		projectRepository,
		provenanceRepository,
		memoryIndexer
	);
	const fallbackAgent = new BaseAgentContext(notes);
	const agentContext = new AgentContext(
		fallbackAgent,
		provisionedSkills,
		notes,
		conversationJournal,
		projects,
		memory
	);
	const controllerFactory = new LateValue<ProductionControllerFactory>();
	const eventBus = new AgentEvents();
	const diagramAgent = new DiagramAuthoring({
		contextBuilder: agentContext,
		conversations: conversationJournal,
		preferences,
		models: modelCatalog,
		runs: runStore,
		provenance,
		builtInSkills,
		defaultModel: defaultAgentModel,
		defaultVisionModel,
		resolveModel: resolveAgentModel,
		createToolEventMapper: () => new AgentToolEventMapper(),
		observeWorkflow: traceWorkflow,
		drawioValidator: new DrawioXmlValidator()
	});
	const agent = new AgentReasoning(
		agentToolRegistry(() => controllerFactory.get(), toolRetriever),
		agentSessions,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		// No transport override: the web-search wrapper is applied per run, so
		// the deployment's search options are passed as defaults instead.
		undefined,
		(repository, actor, conversationId) =>
			new ConversationBuffer(repository, actor, conversationId),
		traceAgentTurn,
		webSearchOptionsFromEnvironment(process.env)
	);
	const artifactApplier = new SuggestionApplication(
		todos,
		relationships,
		references,
		diagrams,
		todos,
		relationships,
		references,
		diagrams,
		memory,
		new DrawioXmlValidator(),
		new DrawioLabelExtractor()
	);
	const drawioReview = new DrawioReview(
		diagrams,
		new DrawioXmlValidator(),
		new DrawioSvgSanitizer(),
		new DrawioDiagramTextExtractor(),
		diagramIndexer
	);

	const dependencies: ProductionControllerDependencies = {
		todos: {
			todoLister: todos,
			todoViewAssembler: todos,
			todoReader: todos,
			todoEditor: todos,
			todoDeleter: todos,
			todoStatusChanger: todos,
			anchorCreator: notes,
			promiseExtractor: new PromiseDiscovery({
				fallback: new DeterministicPromiseExtractor(),
				observer: operationObserver
			}),
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			trustPolicyEvaluator: trust,
			todoCreator: todos,
			suggestionAccepter: suggestions,
			noteReader: notes,
			transactionRunner
		},
		relationships: {
			anchorCreator: notes,
			linkFinder,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner
		},
		references: {
			anchorCreator: notes,
			referenceFinder,
			referenceRanker: references,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner
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
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			mermaidRenderer: diagramTransforms,
			textExtractor: diagramTransforms,
			drawioTextExtractor: new DrawioDiagramTextExtractor(),
			diagramWriter: diagrams,
			diagramIndexer,
			drawioCreator: diagramAgent
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
			executor: undefined as unknown as AgentRunLifecycle // set below after cyclic wiring
		},
		agentSettings: { preferences, models: modelCatalog },
		apiTokens: { tokens: apiTokenService },
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
			userReader,
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
			preferences,
			inlineCompletionGenerator: new InlineSuggestionCompletion(openRouterApiKey, {
				baseURL: openRouterBaseURL,
				appURL,
				observer: operationObserver
			}),
			inlineCompletionContextBuilder: new InlineSuggestionContext({
				searcher: embeddedKnowledgeSearcher,
				memory,
				reranker,
				observer: operationObserver
			}),
			// Controllers are constructed per request, so the process-wide spend
			// guard is wired once here.
			inlineSuggestionThrottle: new InlineSuggestionAdmission()
		},
		feedback: { reports: new FeedbackRecords(db) }
	};
	controllerFactory.set(new ProductionControllerFactory(dependencies));
	const executor = new AgentRunLifecycle({
		runs: runRepository,
		events: runEvents,
		decisions: runDecisions,
		sessions: agentSessions,
		transactions: transactionRunner,
		contextBuilder: agentContext,
		provenance,
		conversations: conversationJournal,
		runner: agent,
		eventBus
	});
	(dependencies.agent as { executor: AgentRunLifecycle }).executor = executor;
	return {
		controllers: controllerFactory.get(),
		recoverInterruptedRuns: async () =>
			(await runRepository.recoverInterrupted('Process restarted')) +
			(await attachmentRepository.failInterrupted()),
		backgroundTasks: [
			new KnowledgeIndexMaintenance(searchRepository, embeddingClient, transactionRunner, {
				...optionalProperty(
					'intervalMs',
					positiveNumberFromEnvironment('EMBEDDING_SWEEP_INTERVAL_MS')
				),
				...optionalProperty(
					'maxSourcesPerTick',
					positiveNumberFromEnvironment('EMBEDDING_SWEEP_MAX_SOURCES')
				)
			}),
			new UploadRetention(attachmentRepository, attachmentStorage, {
				...optionalProperty(
					'intervalMs',
					positiveNumberFromEnvironment('UPLOAD_SWEEP_INTERVAL_MS')
				),
				...optionalProperty(
					'maxPerTick',
					positiveNumberFromEnvironment('UPLOAD_SWEEP_MAX_PER_TICK')
				)
			})
		],
		eventBus,
		provenance,
		toolRetriever
	};
}
