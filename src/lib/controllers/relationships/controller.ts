import type { ActorContext, RelateSelectionInput, RelateSelectionOutput } from '$lib/models';
import type { TransactionRunner } from '$lib/repositories';
import type {
	LinkFinder,
	ProvenanceRecorder,
	SelectionAnchorCreator,
	SuggestionCreator
} from '$lib/services';

export interface RelationshipsController {
	suggestFromSelection(
		actor: ActorContext,
		input: RelateSelectionInput
	): Promise<RelateSelectionOutput>;
}

export interface RelationshipsDependencies {
	anchorCreator: SelectionAnchorCreator;
	linkFinder: LinkFinder;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
}

export class DefaultRelationshipsController implements RelationshipsController {
	constructor(private readonly dependencies: RelationshipsDependencies) {}

	suggestFromSelection(
		actor: ActorContext,
		input: RelateSelectionInput
	): Promise<RelateSelectionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
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
		});
	}
}
