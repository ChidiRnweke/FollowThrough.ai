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
		{
			get: () => () => Promise.reject(new CapabilityNotImplementedError(capability))
		}
	) as T;
}

const unimplemented = createUnimplementedCapability;

const transactionRunner: TransactionRunner = { run: (work) => work() };

export function createUnimplementedProductionFactory(): ProductionControllerFactory {
	const dependencies: ProductionControllerDependencies = {
		extractPromises: {
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			promiseExtractor: unimplemented('PromiseExtractor'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			suggestionCreator: unimplemented('SuggestionCreator'),
			trustPolicyEvaluator: unimplemented('TrustPolicyEvaluator'),
			todoCreator: unimplemented('TodoCreator'),
			suggestionAccepter: unimplemented('SuggestionAccepter')
		},
		relate: {
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			linkFinder: unimplemented('LinkFinder'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			suggestionCreator: unimplemented('SuggestionCreator')
		},
		reference: {
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			referenceFinder: unimplemented('ReferenceFinder'),
			referenceRanker: unimplemented('ReferenceRanker'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			suggestionCreator: unimplemented('SuggestionCreator')
		},
		generateMermaidDiagram: {
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			diagramCreator: unimplemented('MermaidDiagramCreator'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			suggestionCreator: unimplemented('SuggestionCreator')
		},
		reviseMermaidDiagram: {
			diagramFinder: unimplemented('DiagramFinder'),
			diagramReviser: unimplemented('MermaidDiagramReviser'),
			diagramRenderer: unimplemented('MermaidDiagramRenderer'),
			textExtractor: unimplemented('DiagramTextExtractor'),
			diagramWriter: unimplemented('DiagramWriter'),
			diagramIndexer: unimplemented('DiagramIndexer')
		},
		promoteDiagram: {
			diagramFinder: unimplemented('DiagramFinder'),
			drawioCreator: unimplemented('DrawioDiagramCreator'),
			drawioExporter: unimplemented('DrawioDiagramExporter'),
			diagramPromoter: unimplemented('DiagramPromoter'),
			textExtractor: unimplemented('DiagramTextExtractor'),
			diagramWriter: unimplemented('DiagramWriter'),
			diagramIndexer: unimplemented('DiagramIndexer')
		},
		acceptSuggestion: {
			suggestionFinder: unimplemented('SuggestionFinder'),
			suggestionAccepter: unimplemented('SuggestionAccepter'),
			artifactApplier: unimplemented('SuggestionArtifactApplier'),
			transactionRunner
		},
		rejectSuggestion: {
			suggestionFinder: unimplemented('SuggestionFinder'),
			suggestionRejecter: unimplemented('SuggestionRejecter'),
			transactionRunner
		},
		revertSuggestion: {
			suggestionFinder: unimplemented('SuggestionFinder'),
			suggestionReverter: unimplemented('SuggestionReverter'),
			artifactApplier: unimplemented('SuggestionArtifactApplier'),
			transactionRunner
		},
		saveNote: {
			noteEditor: unimplemented('NoteEditor'),
			revisionRecorder: unimplemented('NoteRevisionRecorder'),
			anchorRepairer: unimplemented('SourceAnchorRepairer'),
			noteIndexer: unimplemented('NoteIndexer'),
			transactionRunner
		},
		runAgent: {
			contextBuilder: unimplemented('AgentContextBuilder'),
			agentRunner: unimplemented('AgentRunner')
		},
		createSkillFromSelection: {
			anchorCreator: unimplemented('SelectionAnchorCreator'),
			skillCreator: unimplemented('SkillCreator'),
			provenanceRecorder: unimplemented('ProvenanceRecorder'),
			transactionRunner
		}
	};
	return new ProductionControllerFactory(dependencies);
}
