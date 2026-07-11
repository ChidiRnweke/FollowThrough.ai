import type {
	AcceptSuggestionInput,
	AcceptSuggestionOutput,
	ActorContext,
	AgentEvent,
	CreateSkillFromSelectionInput,
	CreateSkillFromSelectionOutput,
	ExtractPromisesInput,
	ExtractPromisesOutput,
	FindReferencesInput,
	FindReferencesOutput,
	GenerateMermaidDiagramInput,
	GenerateMermaidDiagramOutput,
	PromoteDiagramInput,
	PromoteDiagramOutput,
	RejectSuggestionInput,
	RelateSelectionInput,
	RelateSelectionOutput,
	RevertSuggestionInput,
	ReviseMermaidDiagramInput,
	ReviseMermaidDiagramOutput,
	RunAgentInput,
	SaveNoteInput,
	SaveNoteOutput,
	Suggestion
} from '../models';

export interface ExtractPromisesController {
	execute(actor: ActorContext, input: ExtractPromisesInput): Promise<ExtractPromisesOutput>;
}
export interface RelateController {
	execute(actor: ActorContext, input: RelateSelectionInput): Promise<RelateSelectionOutput>;
}
export interface ReferenceController {
	execute(actor: ActorContext, input: FindReferencesInput): Promise<FindReferencesOutput>;
}
export interface GenerateMermaidDiagramController {
	execute(
		actor: ActorContext,
		input: GenerateMermaidDiagramInput
	): Promise<GenerateMermaidDiagramOutput>;
}
export interface ReviseMermaidDiagramController {
	execute(
		actor: ActorContext,
		input: ReviseMermaidDiagramInput
	): Promise<ReviseMermaidDiagramOutput>;
}
export interface PromoteDiagramController {
	execute(actor: ActorContext, input: PromoteDiagramInput): Promise<PromoteDiagramOutput>;
}
export interface AcceptSuggestionController {
	execute(actor: ActorContext, input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput>;
}
export interface RejectSuggestionController {
	execute(actor: ActorContext, input: RejectSuggestionInput): Promise<Suggestion>;
}
export interface RevertSuggestionController {
	execute(actor: ActorContext, input: RevertSuggestionInput): Promise<Suggestion>;
}
export interface SaveNoteController {
	execute(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput>;
}
export interface RunAgentController {
	execute(actor: ActorContext, input: RunAgentInput): AsyncIterable<AgentEvent>;
}
export interface CreateSkillFromSelectionController {
	execute(
		actor: ActorContext,
		input: CreateSkillFromSelectionInput
	): Promise<CreateSkillFromSelectionOutput>;
}
