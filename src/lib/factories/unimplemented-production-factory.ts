import type { TransactionRunner } from '../repositories';
import {
	ProductionControllerFactory,
	type ProductionControllerDependencies
} from './production-controller-factory';

export class CapabilityNotImplementedError extends Error {
	constructor(readonly capability: string) {
		super(`${capability} is not implemented`);
		this.name = 'CapabilityNotImplementedError';
	}
}

export function createUnimplementedCapability<T extends object>(capability: string): T {
	return new Proxy(
		{},
		{ get: () => () => Promise.reject(new CapabilityNotImplementedError(capability)) }
	) as T;
}

const unimplemented = createUnimplementedCapability;
const transactionRunner: TransactionRunner = { run: (work) => work() };

export function createUnimplementedProductionFactory(): ProductionControllerFactory {
	const dependencies: ProductionControllerDependencies = {
		workspace: {
			userReader: unimplemented('UserReader'),
			projectLister: unimplemented('ProjectLister'),
			noteTreeReader: unimplemented('NoteTreeReader'),
			suggestionLister: unimplemented('SuggestionLister'),
			todoLister: unimplemented('TodoLister'),
			waitingOnFinder: unimplemented('WaitingOnFinder'),
			todoViewAssembler: unimplemented('TodoViewAssembler')
		},
		projects: {
			projectCreator: unimplemented('ProjectCreator'),
			projectReader: unimplemented('ProjectReader'),
			projectLister: unimplemented('ProjectLister'),
			projectEditor: unimplemented('ProjectEditor'),
			projectTreeReader: unimplemented('ProjectTreeReader'),
			folderCreator: unimplemented('FolderCreator'),
			entryMover: unimplemented('ProjectEntryMover'),
			transactionRunner
		},
		notes: {
			noteReader: unimplemented('NoteReader'),
			noteCreator: unimplemented('NoteCreator'),
			relationshipFinder: unimplemented('RelationshipFinder'),
			backlinkViewAssembler: unimplemented('BacklinkViewAssembler'),
			referenceLister: unimplemented('ReferenceLister'),
			diagramLister: unimplemented('DiagramLister'),
			todoLister: unimplemented('TodoLister'),
			todoViewAssembler: unimplemented('TodoViewAssembler'),
			suggestionLister: unimplemented('SuggestionLister'),
			suggestionViewAssembler: unimplemented('SuggestionViewAssembler'),
			noteEditor: unimplemented('NoteEditor'),
			revisionRecorder: unimplemented('NoteRevisionRecorder'),
			anchorRepairer: unimplemented('SourceAnchorRepairer'),
			noteIndexer: unimplemented('NoteIndexer'),
			transactionRunner
		},
		todos: {
			todoLister: unimplemented('TodoLister'),
			todoViewAssembler: unimplemented('TodoViewAssembler'),
			todoReader: unimplemented('TodoReader'),
			todoEditor: unimplemented('TodoEditor'),
			todoStatusChanger: unimplemented('TodoStatusChanger'),
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			promiseExtractor: unimplemented('PromiseExtractor'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			suggestionCreator: unimplemented('SuggestionCreator'),
			trustPolicyEvaluator: unimplemented('TrustPolicyEvaluator'),
			todoCreator: unimplemented('TodoCreator'),
			suggestionAccepter: unimplemented('SuggestionAccepter'),
			noteReader: unimplemented('NoteReader'),
			transactionRunner
		},
		relationships: {
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			linkFinder: unimplemented('LinkFinder'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			suggestionCreator: unimplemented('SuggestionCreator'),
			transactionRunner
		},
		references: {
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			referenceFinder: unimplemented('ReferenceFinder'),
			referenceRanker: unimplemented('ReferenceRanker'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			suggestionCreator: unimplemented('SuggestionCreator'),
			transactionRunner
		},
		diagrams: {
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			mermaidCreator: unimplemented('MermaidDiagramCreator'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			suggestionCreator: unimplemented('SuggestionCreator'),
			transactionRunner,
			diagramFinder: unimplemented('DiagramFinder'),
			mermaidReviser: unimplemented('MermaidDiagramReviser'),
			mermaidRenderer: unimplemented('MermaidDiagramRenderer'),
			textExtractor: unimplemented('DiagramTextExtractor'),
			diagramWriter: unimplemented('DiagramWriter'),
			diagramIndexer: unimplemented('DiagramIndexer'),
			drawioCreator: unimplemented('DrawioDiagramCreator'),
			drawioExporter: unimplemented('DrawioDiagramExporter'),
			diagramPromoter: unimplemented('DiagramPromoter')
		},
		suggestions: {
			suggestionLister: unimplemented('SuggestionLister'),
			suggestionViewAssembler: unimplemented('SuggestionViewAssembler'),
			suggestionFinder: unimplemented('SuggestionFinder'),
			suggestionAccepter: unimplemented('SuggestionAccepter'),
			suggestionRejecter: unimplemented('SuggestionRejecter'),
			suggestionReverter: unimplemented('SuggestionReverter'),
			artifactApplier: unimplemented('SuggestionArtifactApplier'),
			transactionRunner
		},
		skills: {
			skillFinder: unimplemented('SkillFinder'),
			skillUsageLister: unimplemented('SkillUsageLister'),
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			skillCreator: unimplemented('SkillCreator'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			transactionRunner
		},
		agent: {
			contextBuilder: unimplemented('AgentContextBuilder'),
			agentRunner: unimplemented('AgentRunner'),
			conversationJournal: unimplemented('ConversationJournal'),
			provenanceRecorder: unimplemented('ProvenanceRecorder')
		},
		trustPolicies: { trustPolicyStore: unimplemented('TrustPolicyStore') }
	};
	return new ProductionControllerFactory(dependencies);
}
