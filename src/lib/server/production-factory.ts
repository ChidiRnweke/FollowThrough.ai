import { ProductionControllerFactory, type ProductionControllerDependencies } from '$lib/factories';
import {
	EmbeddedKnowledgeSearcher,
	EmbeddedDiagramIndexer,
	EmbeddedNoteIndexer,
	ExpiringSuggestionLister,
	KeywordRelevantSkillSelector,
	PersistentConversationJournal,
	ProjectManagementService,
	NoteManagementService,
	SuggestionExpiryService,
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
import {
	PostgresProvenanceRecorder,
	PostgresSuggestionCapabilities,
	PostgresTrustPolicyCapabilities
} from './domain/automation-capabilities';
import { PostgresTodoCapabilities } from './domain/content-capabilities';
import {
	BasicAgentCapabilities,
	PostgresDiagramCapabilities,
	PostgresSkillCapabilities
} from './domain/diagram-agent-capabilities';
import {
	PostgresKnowledgeCapabilities,
	PostgresReferenceLister
} from './domain/knowledge-capabilities';
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

export function createProductionFactory(): ProductionControllerFactory {
	const projectRepository = new PostgresProjectRepository(db);
	const userReader = new UserManagementService(new PostgresUserRepository(db));
	const projects = new ProjectManagementService(projectRepository, projectRepository);
	const notes = new NoteManagementService(
		new PostgresNoteRepository(db),
		new PostgresSourceAnchorRepository(db),
		projectRepository
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
	const todos = new PostgresTodoCapabilities(db, projectRepository);
	const knowledge = new PostgresKnowledgeCapabilities(db);
	const referenceFinder = new WebSearchReferenceFinder();
	const referenceLister = new PostgresReferenceLister(knowledge);
	const provenance = new PostgresProvenanceRecorder(db);
	const suggestions = new PostgresSuggestionCapabilities(db);
	const suggestionLister = new ExpiringSuggestionLister(
		new SuggestionExpiryService(suggestions),
		suggestions
	);
	const trust = new PostgresTrustPolicyCapabilities(db);
	const diagrams = new PostgresDiagramCapabilities(db);
	const skills = new PostgresSkillCapabilities(db);
	const fallbackAgent = new BasicAgentCapabilities(suggestions, provenance, notes);
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
					referenceRanker: knowledge,
					provenanceRecorder: provenance,
					suggestionCreator: suggestions,
					transactionRunner: postgresTransactionRunner
				}).suggestFromSelection(actor, { selection }),
			generateDiagram: (actor, selection, instruction) =>
				new DefaultDiagramsController({
					anchorCreator: notes,
					mermaidCreator: diagrams,
					provenanceRecorder: provenance,
					suggestionCreator: suggestions,
					transactionRunner: postgresTransactionRunner,
					diagramFinder: diagrams,
					mermaidReviser: diagrams,
					mermaidRenderer: diagrams,
					textExtractor: diagrams,
					diagramWriter: diagrams,
					diagramIndexer,
					drawioCreator: diagrams,
					drawioExporter: diagrams,
					diagramPromoter: diagrams
				}).generateMermaid(actor, { selection, instruction })
		},
		fallbackAgent
	);
	const artifactApplier = new PersistentSuggestionArtifactApplier(
		todos,
		knowledge,
		knowledge,
		diagrams,
		todos,
		knowledge,
		knowledge,
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
			referenceRanker: knowledge,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner: postgresTransactionRunner
		},
		diagrams: {
			anchorCreator: notes,
			mermaidCreator: diagrams,
			provenanceRecorder: provenance,
			suggestionCreator: suggestions,
			transactionRunner: postgresTransactionRunner,
			diagramFinder: diagrams,
			mermaidReviser: diagrams,
			mermaidRenderer: diagrams,
			textExtractor: diagrams,
			diagramWriter: diagrams,
			diagramIndexer,
			drawioCreator: diagrams,
			drawioExporter: diagrams,
			diagramPromoter: diagrams
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
			relationshipFinder: knowledge,
			backlinkViewAssembler: knowledge,
			referenceLister,
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
