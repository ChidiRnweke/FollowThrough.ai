import type { BacklinkSuggestion } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type {
	RelateSelectionInput,
	RelateSelectionOutput,
	LinkCandidate
} from '$lib/models/relationships';
import type { Note, TextSelection } from '$lib/models/notes';
import { relatedNoteMatches, relatedNoteCandidate } from '$lib/services/relationships/candidates';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { RelationshipClassifier } from '$lib/server/services/relationships/contracts';
import type { EmbeddingClient, Reranker } from '$lib/server/services/knowledge-search/contracts';
import {
	queryVector,
	searchCandidateLimit,
	type KnowledgeLookup
} from '$lib/server/services/knowledge-search/semantic';
import type { SelectionOriginService } from '$lib/server/services/notes/contracts';
import type { SuggestionCreator } from '$lib/server/services/suggestions/contracts';
import type { AgentRunReceipt } from '$lib/models/agent';
import type { WorkflowRunStarter } from '$lib/server/services/agent/runs/execution-contracts';

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
	knowledgeLookup: Pick<KnowledgeLookup, 'search'>;
	embeddings: EmbeddingClient;
	reranker: Reranker;
	relationshipClassifier: RelationshipClassifier;
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
			const candidates = await this.findCandidates(actor, source.note, input.selection, signal);
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

	private async findCandidates(
		actor: ActorContext,
		note: Note,
		selection: TextSelection,
		signal?: AbortSignal
	): Promise<readonly LinkCandidate[]> {
		signal?.throwIfAborted();
		if (!selection.text.trim()) return [];
		const batch = await this.dependencies.embeddings.embed([selection.text], signal);
		signal?.throwIfAborted();
		const candidates = await this.dependencies.knowledgeLookup.search(
			actor,
			queryVector(batch),
			searchCandidateLimit(12),
			note.projectId
		);
		// ADR 0036 permits vector order on provider failure, but never on cancellation.
		const matches =
			candidates.length > 1
				? await this.dependencies.reranker
						.rerank(selection.text, candidates, 12, signal)
						.catch((error) => {
							if (signal?.aborted) throw error;
							return candidates.slice(0, 12);
						})
				: candidates;
		signal?.throwIfAborted();
		return Promise.all(
			relatedNoteMatches(note.id, matches).map(async (match) => {
				const classification = await this.dependencies.relationshipClassifier.classify(
					selection.text,
					match.content,
					signal
				);
				signal?.throwIfAborted();
				return relatedNoteCandidate(match, classification);
			})
		);
	}
}
