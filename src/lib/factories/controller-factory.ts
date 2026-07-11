import type {
	AcceptSuggestionController,
	CreateSkillFromSelectionController,
	ExtractPromisesController,
	GenerateMermaidDiagramController,
	PromoteDiagramController,
	ReferenceController,
	RejectSuggestionController,
	RelateController,
	RevertSuggestionController,
	ReviseMermaidDiagramController,
	RunAgentController,
	SaveNoteController
} from '../controllers';

export interface ControllerFactory {
	extractPromises(): ExtractPromisesController;
	relate(): RelateController;
	reference(): ReferenceController;
	generateMermaidDiagram(): GenerateMermaidDiagramController;
	reviseMermaidDiagram(): ReviseMermaidDiagramController;
	promoteDiagram(): PromoteDiagramController;
	acceptSuggestion(): AcceptSuggestionController;
	rejectSuggestion(): RejectSuggestionController;
	revertSuggestion(): RevertSuggestionController;
	saveNote(): SaveNoteController;
	runAgent(): RunAgentController;
	createSkillFromSelection(): CreateSkillFromSelectionController;
}
