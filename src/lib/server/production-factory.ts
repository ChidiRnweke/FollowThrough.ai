import { ProductionControllerFactory, type ProductionControllerDependencies } from '$lib/factories';
import {
	EmbeddedKnowledgeSearcher,
	EmbeddedDiagramIndexer,
	EmbeddedNoteIndexer,
	DiagramManagementService,
	DiagramTransformationService,
	ExpiringSuggestionLister,
	KeywordRelevantSkillSelector,
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
	ProjectScopedLinkFinder
} from '$lib/services';
import {
	DefaultDiagramsController,
	DefaultReferencesController,
	DefaultRelationshipsController,
	DefaultTodosController
} from '$lib/controllers';
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
	const skills = new SkillManagementService(
		new PostgresSkillRepository(db),
		noteRepository,
		provenanceRepository
	);
	const fallbackAgent = new BasicAgent(suggestions, provenance, notes);
	const agentContext = new EnrichedAgentContextBuilder(
		fallbackAgent,
		knowledgeSearcher,
		skills,
		new KeywordRelevantSkillSelector(),
		skills
	);
	const agent = new OpenAIAgentRunner(
		{
			extractPromises: (actor, selection) =>
				new DefaultTodosController({
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
				}).extractPromises(actor, { selection }),
			relate: (actor, selection) =>
				new DefaultRelationshipsController({
					anchorCreator: notes,
					linkFinder,
					provenanceRecorder: provenance,
					suggestionCreator: suggestions,
					transactionRunner: postgresTransactionRunner
				}).suggestFromSelection(actor, { selection }),
			reference: (actor, selection) =>
				new DefaultReferencesController({
					anchorCreator: notes,
					referenceFinder,
					referenceRanker: references,
					provenanceRecorder: provenance,
					suggestionCreator: suggestions,
					transactionRunner: postgresTransactionRunner
				}).suggestFromSelection(actor, { selection }),
			generateDiagram: (actor, selection, instruction) =>
				new DefaultDiagramsController({
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
				}).generateMermaid(actor, { selection, instruction })
		},
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
			provenanceRecorder: provenance
		},
		skills: {
			skillFinder: skills,
			skillUsageLister: skills,
			anchorCreator: notes,
			skillCreator: skills,
			provenanceRecorder: provenance,
			transactionRunner: postgresTransactionRunner
		},
		workspace: {
			userReader,
			projectLister: projects,
			noteTreeReader: notes,
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
	return new ProductionControllerFactory(dependencies);
}
