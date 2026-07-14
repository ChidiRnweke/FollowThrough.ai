import { ProductionControllerFactory, type ProductionControllerDependencies } from '$lib/factories';
import { OpenRouter } from '@openrouter/sdk';
import {
	EmbeddedKnowledgeSearcher,
	EmbeddedDiagramIndexer,
	EmbeddedNoteIndexer,
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
	ProvisioningSkillFinder
} from '$lib/services';
import { db, postgresTransactionRunner } from '$lib/server/db';
import { BasicAgent } from './domain/basic-agent';
import { PersistentSuggestionArtifactApplier } from './domain/suggestion-artifact-applier';
import { OpenAIPromiseExtractor } from './domain/openai-capabilities';
import { WebSearchReferenceFinder } from './domain/openai-reference-capabilities';
import { OpenAIAgentRunner } from './domain/openai-agent-capabilities';
import {
	DeterministicEmbeddingClient,
	OpenAIEmbeddingClient
} from './domain/openai-embedding-capabilities';
import { PostgresRetrievalIndexRepository } from './repositories/postgres-search';
import { PostgresConversationRepository } from './repositories/postgres-conversations';
import { EnrichedAgentContextBuilder } from './domain/agent-context-capabilities';
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
import { PostgresRelationshipRepository } from './repositories/postgres-relationships';
import { PostgresReferenceRepository } from './repositories/postgres-references';
import { PostgresDiagramRepository } from './repositories/postgres-diagrams';
import { PostgresSkillRepository } from './repositories/postgres-skills';
import {
	PostgresAgentPreferencesRepository,
	PostgresAgentRunRepository
} from './repositories/postgres-agent-settings';

const firstConfigured = (...values: readonly (string | undefined)[]): string | undefined =>
	values.map((value) => value?.trim()).find((value): value is string => Boolean(value));

export function createProductionFactory(): ProductionControllerFactory {
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
	const runStore = new PersistentAgentRunStore(new PostgresAgentRunRepository(db));
	const recommendedModels = new Set(
		(process.env.OPENROUTER_RECOMMENDED_MODELS ?? '')
			.split(',')
			.map((model) => model.trim())
			.filter(Boolean)
	);
	const modelCatalog = new OpenRouterModelCatalog(
		new OpenRouter({
			apiKey: process.env.OPENROUTER_API_KEY,
			httpReferer: process.env.PUBLIC_APP_URL ?? 'http://localhost:5173',
			xTitle: 'FollowThrough'
		}),
		recommendedModels
	);
	const defaultAgentModel =
		firstConfigured(process.env.OPENROUTER_DEFAULT_MODEL, process.env.OPENAI_AGENT_MODEL) ??
		'openai/gpt-5.6';
	const embeddingClient = process.env.OPENAI_API_KEY
		? new OpenAIEmbeddingClient(process.env.OPENAI_API_KEY)
		: new DeterministicEmbeddingClient();
	const noteIndexer = new EmbeddedNoteIndexer(searchRepository, embeddingClient);
	const diagramIndexer = new EmbeddedDiagramIndexer(searchRepository, embeddingClient, notes);
	const knowledgeSearcher = new EmbeddedKnowledgeSearcher(searchRepository, embeddingClient);
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
	const referenceFinder = new WebSearchReferenceFinder();
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
	const provisionedSkills = new ProvisioningSkillFinder(
		new DefaultBuiltInSkillProvisioner(projectRepository, noteRepository, skillRepository),
		skills
	);
	const fallbackAgent = new BasicAgent(suggestions, provenance, notes);
	const agentContext = new EnrichedAgentContextBuilder(
		fallbackAgent,
		knowledgeSearcher,
		provisionedSkills,
		notes
	);
	let controllerFactory: ProductionControllerFactory | undefined;
	const agent = new OpenAIAgentRunner(
		() => {
			if (!controllerFactory) throw new Error('Controller factory is not initialized');
			return controllerFactory;
		},
		runStore,
		fallbackAgent
	);
	const artifactApplier = new PersistentSuggestionArtifactApplier(
		todos,
		relationships,
		references,
		diagrams,
		todos,
		relationships,
		references,
		diagrams
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
			transactionRunner: postgresTransactionRunner
		},
		relationships: {
			anchorCreator: notes,
			linkFinder,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner: postgresTransactionRunner
		},
		references: {
			anchorCreator: notes,
			referenceFinder,
			referenceRanker: references,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner: postgresTransactionRunner
		},
		diagrams: {
			anchorCreator: notes,
			mermaidCreator: diagramTransforms,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner: postgresTransactionRunner,
			diagramFinder: diagrams,
			mermaidReviser: diagramTransforms,
			mermaidRenderer: diagramTransforms,
			textExtractor: diagramTransforms,
			diagramWriter: diagrams,
			diagramIndexer,
			drawioCreator: diagramTransforms,
			drawioExporter: diagramTransforms,
			diagramPromoter: diagramTransforms
		},
		suggestions: {
			suggestionLister,
			suggestionViewAssembler: suggestions,
			suggestionFinder: suggestions,
			suggestionAccepter: suggestions,
			artifactApplier,
			transactionRunner: postgresTransactionRunner,
			suggestionRejecter: suggestions,
			suggestionReverter: suggestions
		},
		agent: {
			contextBuilder: agentContext,
			agentRunner: agent,
			conversationJournal,
			provenanceRecorder: provenance,
			preferences,
			models: modelCatalog,
			runStore,
			defaultModel: defaultAgentModel
		},
		agentSettings: { preferences, models: modelCatalog },
		skills: {
			skillFinder: provisionedSkills,
			skillUsageLister: skills,
			skillUsageRecorder: skills,
			skillVersionManager: skills,
			anchorCreator: notes,
			skillCreator: skills,
			noteCreator: notes,
			provenanceRecorder: provenance,
			transactionRunner: postgresTransactionRunner
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
			noteCreator: notes,
			relationshipFinder: relationships,
			backlinkViewAssembler: relationships,
			referenceLister: references,
			diagramLister: diagrams,
			todoLister: todos,
			todoViewAssembler: todos,
			suggestionLister,
			suggestionViewAssembler: suggestions,
			noteEditor: notes,
			noteArchiver: notes,
			revisionRecorder: notes,
			anchorRepairer: notes,
			noteIndexer,
			transactionRunner: postgresTransactionRunner
		},
		trustPolicies: { trustPolicyStore: trust },
		projects: {
			projectCreator: projects,
			projectReader: projects,
			projectLister: projects,
			projectEditor: projects,
			projectTreeReader: projects,
			folderCreator: projects,
			entryMover: projects,
			transactionRunner: postgresTransactionRunner
		}
	};
	controllerFactory = new ProductionControllerFactory(dependencies);
	return controllerFactory;
}
