import type { ActorContext } from '$lib/models/identity';
import type { RelateSelectionInput, RelateSelectionOutput } from '$lib/models/relationships';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { LinkFinder } from '$lib/server/services/relationships/contracts';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { SelectionAnchorCreator } from '$lib/server/services/notes/contracts';
import type { SuggestionCreator } from '$lib/server/services/suggestions/contracts';

/**
 * Application boundary for relationship (backlink) suggestions between notes: find notes
 * related to a text selection and create reviewable backlink suggestions, all in one
 * transaction with provenance tying each suggestion back to the selection's anchor.
 */
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

export class Relationships implements RelationshipsController {
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
