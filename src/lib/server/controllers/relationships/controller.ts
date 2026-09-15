import type { BacklinkSuggestion } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type { RelateSelectionInput, RelateSelectionOutput } from '$lib/models/relationships';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { LinkFinder } from '$lib/server/services/relationships/contracts';
import type { SelectionOriginService } from '$lib/server/services/notes/contracts';
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
	): Promise<RelateSelectionOutput<BacklinkSuggestion>>;
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
	selectionOrigins: SelectionOriginService;
	linkFinder: LinkFinder;
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
	): Promise<RelateSelectionOutput<BacklinkSuggestion>> {
		return this.dependencies.transactionRunner.run(async () => {
			const source = await this.dependencies.selectionOrigins.resolve(actor, input.selection);
			const { anchor } = source;
			const candidates = await this.dependencies.linkFinder.find(actor, input.selection, signal);
			const origin = await this.dependencies.selectionOrigins.record(actor, source, {
				producerKind: 'pipeline',
				producerName: 'Relate',
				pipeline: 'relate',
				metadata: {}
			});
			const suggestions = await Promise.all(
				candidates.map((candidate) =>
					this.dependencies.suggestionCreator.createFromSelection(actor, origin, {
						kind: 'backlink',
						confidence: candidate.confidence,
						payload: {
							targetNoteId: candidate.targetNoteId,
							kind: candidate.kind,
							justification: candidate.justification
						}
					})
				)
			);
			return { anchorId: anchor.id, suggestions };
		});
	}
}
