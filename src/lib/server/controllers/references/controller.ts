import type { ActorContext } from '$lib/models/identity';
import type { FindReferencesInput, FindReferencesOutput } from '$lib/models/references';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type {
	ReferenceFinder,
	ReferenceRanker,
	ReferenceSearchOptions
} from '$lib/server/services/references/contracts';
import type { SelectionAnchorCreator } from '$lib/server/services/notes/contracts';
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
	): Promise<FindReferencesOutput>;
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
	anchorCreator: SelectionAnchorCreator;
	referenceFinder: ReferenceFinder;
	referenceRanker: ReferenceRanker;
	provenanceRecorder: ProvenanceRecorder;
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
	): Promise<FindReferencesOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const anchor = await this.dependencies.anchorCreator.create(actor, input.selection);
			const found = await this.dependencies.referenceFinder.find(actor, input.selection, options);
			const ranked = await this.dependencies.referenceRanker.rank(actor, input.selection, found);
			if (ranked.length === 0) return { outcome: 'nothing_relevant', anchorId: anchor.id };
			const provenance = await this.dependencies.provenanceRecorder.record(actor, {
				producerKind: 'pipeline',
				producerName: 'Reference',
				pipeline: 'reference',
				sourceAnchorId: anchor.id,
				metadata: {}
			});
			const suggestions = await Promise.all(
				ranked.map((candidate) =>
					this.dependencies.suggestionCreator.create(actor, {
						kind: 'reference',
						noteId: input.selection.noteId,
						confidence: candidate.confidence,
						provenanceId: provenance.id,
						sourceAnchorId: anchor.id,
						payload: {
							noteId: input.selection.noteId,
							url: candidate.url,
							title: candidate.title,
							tier: candidate.tier,
							relevanceNote: candidate.relevanceNote,
							sourceAnchorId: anchor.id,
							provenanceId: provenance.id
						}
					})
				)
			);
			return { outcome: 'found', anchorId: anchor.id, suggestions };
		});
	}
}
