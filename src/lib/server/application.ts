import { ProductionControllerFactory, type ProductionControllerDependencies } from '$lib/factories';
import { OpenRouter } from '@openrouter/sdk';
import {
	EmbeddedKnowledgeSearcher,
	RerankingKnowledgeSearcher,
	EmbeddedDiagramIndexer,
	EmbeddedMemoryIndexer,
	EmbeddedNoteIndexer,
	MemoryManagementService,
	DiagramManagementService,
	DiagramTransformationService,
	DefaultBuiltInSkillProvisioner,
	ExpiringSuggestionLister,
	OpenRouterModelCatalog,
	PersistentAgentPreferencesStore,
	PersistentAgentRunStore,
	PersistentConversationJournal,
	ProjectManagementService,
	ReferenceManagementService,
	RelationshipManagementService,
	NoteManagementService,
	ProvenanceManagementService,
	SuggestionManagementService,
	SkillManagementService,
	TodoManagementService,
	TrustPolicyManagementService,
	UserManagementService,
	ProjectScopedLinkFinder,
	ProvisioningSkillFinder,
	AttachmentManagementService,
	EmbeddedToolRetriever,
	normalizeOpenRouterModelId,
	type AgentModelCatalog,
	type Condenser,
	type EmbeddingClient,
	type ReferenceFinder,
	type Reranker
} from '$lib/services';
import type { TransactionRunner } from '$lib/repositories';
import type { Database } from './db';
import { BasicAgent } from './domain/basic-agent';
import { PersistentSuggestionArtifactApplier } from './domain/suggestion-artifact-applier';
import { OpenAIPromiseExtractor } from './domain/openai-capabilities';
import { WebSearchReferenceFinder } from './domain/openai-reference-capabilities';
import { OpenAIAgentRunner } from './domain/openai-agent-capabilities';
import { OpenAIDiagramAgent } from './domain/openai-diagram-agent';
import { OpenAIEmbeddingClient } from './domain/openai-embedding-capabilities';
import { DEFAULT_GENERATION_MODEL, DEFAULT_OPENROUTER_BASE_URL } from './domain/openrouter-client';
import { OpenRouterReranker } from './domain/openrouter-rerank-capabilities';
import { ConversationCondenser } from './domain/conversation-condenser';
import { PostgresRetrievalIndexRepository } from './repositories/postgres-search';
import { PostgresConversationRepository } from './repositories/postgres-conversations';
import { EnrichedAgentContextBuilder } from './domain/agent-context-capabilities';
import {
	AttachmentParserRegistry,
	S3AttachmentStorage,
	type AttachmentStorage,
	type S3AttachmentStorageConfig
} from './domain/attachment-storage';
import { OpenAIRelationshipClassifier } from './domain/openai-relationship-capabilities';
import { PostgresProjectRepository } from './repositories/postgres-projects';
import { PostgresUserRepository } from './repositories/postgres-users';
import {
	PostgresNoteRepository,
	PostgresSourceAnchorRepository
} from './repositories/postgres-notes';
import { PostgresProvenanceRepository } from './repositories/postgres-provenance';
import { PostgresTodoRepository } from './repositories/postgres-todos';
import { PostgresSuggestionRepository } from './repositories/postgres-suggestions';
import { PostgresTrustPolicyRepository } from './repositories/postgres-trust-policies';
import { PostgresMemoryEntryRepository } from './repositories/postgres-memory-entries';
import { PostgresExportSettingsRepository } from './repositories/postgres-export-settings';
import { PostgresRelationshipRepository } from './repositories/postgres-relationships';
import { PostgresReferenceRepository } from './repositories/postgres-references';
import { PostgresDiagramRepository } from './repositories/postgres-diagrams';
import { PostgresSkillRepository } from './repositories/postgres-skills';
import { PostgresAttachmentRepository } from './repositories/postgres-attachments';
import { PostgresTemplateRepository } from './repositories/postgres-templates';
import { PostgresArtifactRepository } from './repositories/postgres-artifacts';
import { TemplateManagementService } from '$lib/services/templates/management';
import { ArtifactManagementService } from '$lib/services/artifacts/management';
import { generateDocx } from './domain/docx-generator';
import { generatePdf } from './domain/pdf-generator';
import {
	PostgresAgentPreferencesRepository,
	PostgresAgentRunRepository,
	PostgresAgentSessionRepository
} from './repositories/postgres-agent-settings';
import {
	PostgresAgentRunDecisionRepository,
	PostgresAgentRunEventRepository
} from './repositories/postgres-agent-runs';
import { AgentRunExecutor } from './domain/agent-run-executor';
import { InProcessAgentEventBus, type AgentEventBus } from './domain/agent-event-bus';
import {
	DrawioSvgSanitizer,
	DrawioXmlValidator,
	DrawioDiagramTextExtractor
} from './domain/drawio-content';

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
	readonly attachmentStorage?: AttachmentStorage;
	readonly referenceFinder?: ReferenceFinder;
	readonly modelCatalog?: AgentModelCatalog;
}

export interface ApplicationConfig {
	readonly db: Database;
	readonly transactionRunner: TransactionRunner;
	readonly openRouterApiKey: string;
	readonly openRouterBaseURL?: string;
	readonly appURL?: string;
	readonly defaultAgentModel?: string;
	readonly recommendedModels?: readonly string[];
	readonly s3?: S3AttachmentStorageConfig;
	readonly overrides?: ApplicationOverrides;
}

export interface ProductionApplication {
	readonly controllers: ProductionControllerFactory;
	readonly recoverInterruptedRuns: () => Promise<number>;
	readonly eventBus: AgentEventBus;
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
	const openRouterBaseURL = config.openRouterBaseURL ?? DEFAULT_OPENROUTER_BASE_URL;
	const appURL = config.appURL ?? 'http://localhost:5173';
	const defaultAgentModel = config.defaultAgentModel ?? DEFAULT_GENERATION_MODEL;

	const projectRepository = new PostgresProjectRepository(db);
	const userReader = new UserManagementService(new PostgresUserRepository(db));
	const projects = new ProjectManagementService(projectRepository, projectRepository);
	const noteRepository = new PostgresNoteRepository(db);
	const anchorRepository = new PostgresSourceAnchorRepository(db);
	const provenanceRepository = new PostgresProvenanceRepository(db);
	const notes = new NoteManagementService(noteRepository, anchorRepository, projectRepository);
	const provenance = new ProvenanceManagementService(provenanceRepository, anchorRepository);
	const todos = new TodoManagementService(
		new PostgresTodoRepository(db),
		projectRepository,
		anchorRepository,
		noteRepository,
		provenanceRepository
	);
	const searchRepository = new PostgresRetrievalIndexRepository(db);
	const conversationJournal = new PersistentConversationJournal(
		new PostgresConversationRepository(db)
	);
	const preferences = new PersistentAgentPreferencesStore(
		new PostgresAgentPreferencesRepository(db)
	);
	const runRepository = new PostgresAgentRunRepository(db);
	const runStore = new PersistentAgentRunStore(runRepository);
	const runEvents = new PostgresAgentRunEventRepository(db);
	const runDecisions = new PostgresAgentRunDecisionRepository(db);
	const agentSessions = new PostgresAgentSessionRepository(db);
	const attachmentStorage =
		overrides.attachmentStorage ??
		new S3AttachmentStorage(
			config.s3 ?? {
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				accessKeyId: 'followthrough',
				secretAccessKey: 'followthrough-local-secret',
				bucket: 'followthrough-attachments',
				forcePathStyle: true
			}
		);
	const templateRepository = new PostgresTemplateRepository(db);
	const artifactRepository = new PostgresArtifactRepository(db);
	const templates = new TemplateManagementService(
		attachmentStorage,
		templateRepository,
		transactionRunner
	);
	const artifacts = new ArtifactManagementService(
		artifactRepository,
		attachmentStorage,
		generateDocx,
		generatePdf,
		provenance,
		notes,
		templateRepository,
		transactionRunner,
		new PostgresExportSettingsRepository(db)
	);
	const modelCatalog =
		overrides.modelCatalog ??
		new OpenRouterModelCatalog(
			new OpenRouter({
				apiKey: openRouterApiKey,
				httpReferer: appURL,
				xTitle: 'FollowThrough'
			}),
			new Set((config.recommendedModels ?? []).map(normalizeOpenRouterModelId))
		);
	const embeddingClient =
		overrides.embeddingClient ??
		new OpenAIEmbeddingClient(openRouterApiKey, {
			baseURL: openRouterBaseURL,
			appURL
		});
	const reranker =
		overrides.reranker ??
		new OpenRouterReranker(openRouterApiKey, {
			baseURL: openRouterBaseURL,
			appURL
		});
	const condenser =
		overrides.condenser ??
		new ConversationCondenser(openRouterApiKey, {
			baseURL: openRouterBaseURL,
			appURL
		});
	const toolRetriever = new EmbeddedToolRetriever(embeddingClient);
	const attachmentRepository = new PostgresAttachmentRepository(db);
	const attachments = new AttachmentManagementService(
		attachmentRepository,
		noteRepository,
		attachmentStorage,
		new AttachmentParserRegistry(),
		searchRepository,
		embeddingClient
	);
	const noteIndexer = new EmbeddedNoteIndexer(searchRepository, embeddingClient);
	const diagramIndexer = new EmbeddedDiagramIndexer(searchRepository, embeddingClient, notes);
	const knowledgeSearcher = new RerankingKnowledgeSearcher(
		new EmbeddedKnowledgeSearcher(searchRepository, embeddingClient),
		reranker
	);
	const linkFinder = new ProjectScopedLinkFinder(
		notes,
		knowledgeSearcher,
		new OpenAIRelationshipClassifier()
	);
	const relationships = new RelationshipManagementService(
		new PostgresRelationshipRepository(db),
		noteRepository,
		anchorRepository,
		provenanceRepository
	);
	const references = new ReferenceManagementService(
		new PostgresReferenceRepository(db),
		noteRepository,
		anchorRepository,
		provenanceRepository
	);
	const referenceFinder =
		overrides.referenceFinder ??
		new WebSearchReferenceFinder({
			apiKey: openRouterApiKey,
			baseURL: openRouterBaseURL,
			appURL,
			defaultModel: normalizeOpenRouterModelId(defaultAgentModel)
		});
	const suggestions = new SuggestionManagementService(
		new PostgresSuggestionRepository(db),
		noteRepository,
		provenanceRepository,
		anchorRepository
	);
	const suggestionLister = new ExpiringSuggestionLister(suggestions, suggestions);
	const trust = new TrustPolicyManagementService(new PostgresTrustPolicyRepository(db));
	const diagrams = new DiagramManagementService(
		new PostgresDiagramRepository(db),
		noteRepository,
		anchorRepository,
		provenanceRepository
	);
	const diagramTransforms = new DiagramTransformationService();
	const skillRepository = new PostgresSkillRepository(db);
	const skills = new SkillManagementService(skillRepository, noteRepository, provenanceRepository);
	const builtInSkills = new DefaultBuiltInSkillProvisioner(
		projectRepository,
		noteRepository,
		skillRepository
	);
	const provisionedSkills = new ProvisioningSkillFinder(builtInSkills, skills);
	const memoryIndexer = new EmbeddedMemoryIndexer(searchRepository, embeddingClient);
	const memory = new MemoryManagementService(
		new PostgresMemoryEntryRepository(db),
		projectRepository,
		provenanceRepository,
		memoryIndexer
	);
	const fallbackAgent = new BasicAgent(suggestions, provenance, notes);
	const agentContext = new EnrichedAgentContextBuilder(
		fallbackAgent,
		provisionedSkills,
		notes,
		undefined,
		skills,
		conversationJournal,
		projects
	);
	// eslint-disable-next-line prefer-const -- assigned after the cyclic agent/controller wiring is assembled.
	let controllerFactory: ProductionControllerFactory | undefined;
	const eventBus = new InProcessAgentEventBus();
	const diagramAgent = new OpenAIDiagramAgent({
		contextBuilder: agentContext,
		conversations: conversationJournal,
		preferences,
		runs: runStore,
		sessions: agentSessions,
		provenance,
		builtInSkills,
		defaultModel: defaultAgentModel
	});
	const agent = new OpenAIAgentRunner(
		() => {
			if (!controllerFactory) throw new Error('Controller factory is not initialized');
			return controllerFactory;
		},
		agentSessions,
		openRouterApiKey,
		openRouterBaseURL,
		appURL,
		toolRetriever
	);
	const artifactApplier = new PersistentSuggestionArtifactApplier(
		todos,
		relationships,
		references,
		diagrams,
		todos,
		relationships,
		references,
		diagrams,
		memory
	);

	const dependencies: ProductionControllerDependencies = {
		todos: {
			todoLister: todos,
			todoViewAssembler: todos,
			todoReader: todos,
			todoEditor: todos,
			todoStatusChanger: todos,
			anchorCreator: notes,
			promiseExtractor: new OpenAIPromiseExtractor(),
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
			transactionRunner,
			defaultModel: defaultAgentModel,
			executor: undefined as unknown as AgentRunExecutor // set below after cyclic wiring
		},
		agentSettings: { preferences, models: modelCatalog },
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
		}
	};
	controllerFactory = new ProductionControllerFactory(dependencies);
	const executor = new AgentRunExecutor({
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
	(dependencies.agent as { executor: AgentRunExecutor }).executor = executor;
	return {
		controllers: controllerFactory,
		recoverInterruptedRuns: async () =>
			(await runRepository.recoverInterrupted('Process restarted')) +
			(await attachmentRepository.failInterrupted()),
		eventBus
	};
}
