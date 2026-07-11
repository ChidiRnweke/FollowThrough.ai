import type { ActorContext, RelateSelectionInput, RelateSelectionOutput } from '../models';
import type {
	LinkFinder,
	ProvenanceRecorder,
	SelectionAnchorCreator,
	SuggestionCreator
} from '../services';
export interface RelateDependencies {
	anchorCreator: SelectionAnchorCreator;
	linkFinder: LinkFinder;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
}
export class DefaultRelateController {
	constructor(private readonly dependencies: RelateDependencies) {}
	async execute(actor: ActorContext, input: RelateSelectionInput): Promise<RelateSelectionOutput> {
		const anchor = await this.dependencies.anchorCreator.create(actor, input.selection);
		const candidates = await this.dependencies.linkFinder.find(actor, input.selection);
		const provenance = await this.dependencies.provenanceRecorder.record(actor, {
			producerKind: 'pipeline',
			producerName: 'Relate',
			pipeline: 'relate',
			sourceAnchorId: anchor.id,
			metadata: {}
		});
		const suggestions = await Promise.all(
			candidates.map((candidate) =>
				this.dependencies.suggestionCreator.create(actor, {
					kind: 'backlink',
					noteId: input.selection.noteId,
					confidence: candidate.confidence,
					provenanceId: provenance.id,
					sourceAnchorId: anchor.id,
					payload: {
						sourceNoteId: input.selection.noteId,
						targetNoteId: candidate.targetNoteId,
						kind: candidate.kind,
						justification: candidate.justification,
						sourceAnchorId: anchor.id,
						provenanceId: provenance.id
					}
				})
			)
		);
		return { anchorId: anchor.id, suggestions };
	}
}
