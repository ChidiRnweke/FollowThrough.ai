import type { ActorContext } from '$lib/models/identity';
import type { RelateSelectionInput, RelateSelectionOutput } from '$lib/models/relationships';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { LinkFinder } from '$lib/server/services/relationships/contracts';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type { SelectionAnchorCreator } from '$lib/server/services/notes/contracts';
import type { SuggestionCreator } from '$lib/server/services/suggestions/contracts';
import type { AgentRunReceipt } from '$lib/models/agent';
import type { WorkflowRunStarter } from '$lib/server/services/agent/runs/workflow';

/**
 * Application boundary for relationship (backlink) suggestions between notes: find notes
 * related to a text selection and create reviewable backlink suggestions, all in one
 * transaction with provenance tying each suggestion back to the selection's anchor.
 */
export interface RelationshipsController {
	suggestFromSelection(
		actor: ActorContext,
		input: RelateSelectionInput,
		signal?: AbortSignal
	): Promise<RelateSelectionOutput>;
	/**
	 * Start {@link suggestFromSelection} as a cancellable run, returning once the run
	 * is durable. Its result arrives as a `workflow_result` event, so a refresh mid-run
	 * still collects the suggestions.
	 */
	startSuggestFromSelection(
		actor: ActorContext,
		input: RelateSelectionInput
	): Promise<AgentRunReceipt>;
}

export interface RelationshipsDependencies {
	anchorCreator: SelectionAnchorCreator;
	linkFinder: LinkFinder;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
	workflowRunner: WorkflowRunStarter;
}

export class Relationships implements RelationshipsController {
	constructor(private readonly dependencies: RelationshipsDependencies) {}

	startSuggestFromSelection(
		actor: ActorContext,
		input: RelateSelectionInput
	): Promise<AgentRunReceipt> {
		return this.dependencies.workflowRunner.start(actor, {
			action: 'relate',
			noteId: input.selection.noteId,
			title: 'Relate selection',
			run: (signal) => this.suggestFromSelection(actor, input, signal)
		});
	}

	suggestFromSelection(
		actor: ActorContext,
		input: RelateSelectionInput,
		signal?: AbortSignal
	): Promise<RelateSelectionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const anchor = await this.dependencies.anchorCreator.create(actor, input.selection);
			const candidates = await this.dependencies.linkFinder.find(actor, input.selection, signal);
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
