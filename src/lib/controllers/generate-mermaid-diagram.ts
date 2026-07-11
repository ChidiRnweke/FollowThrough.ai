import type {
	ActorContext,
	GenerateMermaidDiagramInput,
	GenerateMermaidDiagramOutput
} from '../models';
import type {
	MermaidDiagramCreator,
	ProvenanceRecorder,
	SelectionAnchorCreator,
	SuggestionCreator
} from '../services';
export interface GenerateMermaidDiagramDependencies {
	anchorCreator: SelectionAnchorCreator;
	diagramCreator: MermaidDiagramCreator;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
}
export class DefaultGenerateMermaidDiagramController {
	constructor(private readonly dependencies: GenerateMermaidDiagramDependencies) {}
	async execute(
		actor: ActorContext,
		input: GenerateMermaidDiagramInput
	): Promise<GenerateMermaidDiagramOutput> {
		const anchor = await this.dependencies.anchorCreator.create(actor, input.selection);
		const diagram = await this.dependencies.diagramCreator.create(
			actor,
			input.selection,
			input.instruction
		);
		const provenance = await this.dependencies.provenanceRecorder.record(actor, {
			producerKind: 'agent',
			producerName: 'Mermaid Diagram Creator',
			pipeline: 'agent',
			sourceAnchorId: anchor.id,
			metadata: {}
		});
		const suggestion = await this.dependencies.suggestionCreator.create(actor, {
			kind: 'diagram',
			noteId: input.selection.noteId,
			provenanceId: provenance.id,
			sourceAnchorId: anchor.id,
			payload: { noteId: input.selection.noteId, kind: 'mermaid', ...diagram }
		});
		return { anchorId: anchor.id, suggestion };
	}
}
