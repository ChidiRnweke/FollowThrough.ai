import {
	DefaultAcceptSuggestionController,
	DefaultCreateSkillFromSelectionController,
	DefaultExtractPromisesController,
	DefaultGenerateMermaidDiagramController,
	DefaultPromoteDiagramController,
	DefaultReferenceController,
	DefaultRejectSuggestionController,
	DefaultRelateController,
	DefaultRevertSuggestionController,
	DefaultReviseMermaidDiagramController,
	DefaultRunAgentController,
	DefaultSaveNoteController,
	type AcceptSuggestionDependencies,
	type CreateSkillFromSelectionDependencies,
	type ExtractPromisesDependencies,
	type GenerateMermaidDiagramDependencies,
	type PromoteDiagramDependencies,
	type ReferenceDependencies,
	type RejectSuggestionDependencies,
	type RelateDependencies,
	type RevertSuggestionDependencies,
	type ReviseMermaidDiagramDependencies,
	type RunAgentDependencies,
	type SaveNoteDependencies
} from '../controllers';
import type { ControllerFactory } from './controller-factory';

export interface ProductionControllerDependencies {
	extractPromises: ExtractPromisesDependencies;
	relate: RelateDependencies;
	reference: ReferenceDependencies;
	generateMermaidDiagram: GenerateMermaidDiagramDependencies;
	reviseMermaidDiagram: ReviseMermaidDiagramDependencies;
	promoteDiagram: PromoteDiagramDependencies;
	acceptSuggestion: AcceptSuggestionDependencies;
	rejectSuggestion: RejectSuggestionDependencies;
	revertSuggestion: RevertSuggestionDependencies;
	saveNote: SaveNoteDependencies;
	runAgent: RunAgentDependencies;
	createSkillFromSelection: CreateSkillFromSelectionDependencies;
}

export class ProductionControllerFactory implements ControllerFactory {
	constructor(private readonly dependencies: ProductionControllerDependencies) {}
	extractPromises() {
		return new DefaultExtractPromisesController(this.dependencies.extractPromises);
	}
	relate() {
		return new DefaultRelateController(this.dependencies.relate);
	}
	reference() {
		return new DefaultReferenceController(this.dependencies.reference);
	}
	generateMermaidDiagram() {
		return new DefaultGenerateMermaidDiagramController(this.dependencies.generateMermaidDiagram);
	}
	reviseMermaidDiagram() {
		return new DefaultReviseMermaidDiagramController(this.dependencies.reviseMermaidDiagram);
	}
	promoteDiagram() {
		return new DefaultPromoteDiagramController(this.dependencies.promoteDiagram);
	}
	acceptSuggestion() {
		return new DefaultAcceptSuggestionController(this.dependencies.acceptSuggestion);
	}
	rejectSuggestion() {
		return new DefaultRejectSuggestionController(this.dependencies.rejectSuggestion);
	}
	revertSuggestion() {
		return new DefaultRevertSuggestionController(this.dependencies.revertSuggestion);
	}
	saveNote() {
		return new DefaultSaveNoteController(this.dependencies.saveNote);
	}
	runAgent() {
		return new DefaultRunAgentController(this.dependencies.runAgent);
	}
	createSkillFromSelection() {
		return new DefaultCreateSkillFromSelectionController(
			this.dependencies.createSkillFromSelection
		);
	}
}
