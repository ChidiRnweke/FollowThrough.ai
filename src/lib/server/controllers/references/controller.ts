import type { ReferenceSuggestion } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type { FindReferencesInput, FindReferencesOutput } from '$lib/models/references';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	ReferenceFinder,
	ReferenceRanker,
	ReferenceSearchOptions
} from '$lib/server/services/references/contracts';
import type { SelectionOriginService } from '$lib/server/services/notes/contracts';
import type { SuggestionCreator } from '$lib/server/services/suggestions/contracts';
import type { AgentRunReceipt } from '$lib/models/agent';
import type { WorkflowRunStarter } from '$lib/server/services/agent/runs/workflow';

/**
 * Application boundary for reference suggestions: given a text selection, find and rank
 * relevant external references and create reviewable suggestions, all in one
 * transaction so the anchor, provenance, and suggestions land atomically or not at all.
 */
export interface ReferencesController {
	suggestFromSelection(
		actor: ActorContext,
		input: FindReferencesInput,
		options?: ReferenceSearchOptions
	): Promise<FindReferencesOutput<ReferenceSuggestion>>;
	/**
	 * Start {@link suggestFromSelection} as a cancellable run, returning once the run
	 * is durable. Its result arrives as a `workflow_result` event, so a refresh mid-run
	 * still collects the suggestions.
	 */
	startSuggestFromSelection(
		actor: ActorContext,
		input: FindReferencesInput
	): Promise<AgentRunReceipt>;
}

export interface ReferencesDependencies {
	selectionOrigins: SelectionOriginService;
	referenceFinder: ReferenceFinder;
	referenceRanker: ReferenceRanker;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
	workflowRunner: WorkflowRunStarter;
}

export class References implements ReferencesController {
	constructor(private readonly dependencies: ReferencesDependencies) {}

	startSuggestFromSelection(
		actor: ActorContext,
		input: FindReferencesInput
	): Promise<AgentRunReceipt> {
		return this.dependencies.workflowRunner.start(actor, {
			action: 'reference',
			noteId: input.selection.noteId,
			title: 'Find references',
			run: (signal) => this.suggestFromSelection(actor, input, { signal })
		});
	}

	suggestFromSelection(
		actor: ActorContext,
		input: FindReferencesInput,
		options?: ReferenceSearchOptions
	): Promise<FindReferencesOutput<ReferenceSuggestion>> {
		return this.dependencies.transactionRunner.run(async () => {
			const source = await this.dependencies.selectionOrigins.resolve(actor, input.selection);
			const { anchor } = source;
			const found = await this.dependencies.referenceFinder.find(actor, input.selection, options);
			const ranked = await this.dependencies.referenceRanker.rank(actor, input.selection, found);
			if (ranked.length === 0) return { outcome: 'nothing_relevant', anchorId: anchor.id };
			const origin = await this.dependencies.selectionOrigins.record(actor, source, {
				producerKind: 'pipeline',
				producerName: 'Reference',
				pipeline: 'reference',
				metadata: {}
			});
			const suggestions = await Promise.all(
				ranked.map((candidate) =>
					this.dependencies.suggestionCreator.createFromSelection(actor, origin, {
						kind: 'reference',
						confidence: candidate.confidence,
						payload: {
							url: candidate.url,
							title: candidate.title,
							tier: candidate.tier,
							relevanceNote: candidate.relevanceNote
						}
					})
				)
			);
			return { outcome: 'found', anchorId: anchor.id, suggestions };
		});
	}
}
