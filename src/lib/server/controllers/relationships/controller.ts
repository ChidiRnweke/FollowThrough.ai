import type { BacklinkSuggestion } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type {
	RelateSelectionInput,
	StartRelateSelectionInput,
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
import type {
	AgentRunReceipt,
	AgentRunId,
	RunSettlementOutcome,
	NoteActionRequest,
	SelectionGeneration
} from '$lib/models/agent';
import {
	DuplicateNoteActionRequest,
	type NoteActionRequests
} from '$lib/server/services/agent/runs/note-action-requests';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { AgentEventBus } from '$lib/server/services/agent/runs/events';
import type { RelationshipRules } from '$lib/server/services/relationships/rules';
import { registerActiveRun, releaseActiveRun } from '$lib/server/services/agent/runs/active-runs';

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
		input: StartRelateSelectionInput
	): Promise<AgentRunReceipt>;
	executeRelatedNoteRun(actor: ActorContext, runId: AgentRunId): Promise<void>;
	recoverQueuedRelatedNoteRuns(): Promise<number>;
}

export interface RelationshipsDependencies {
	selectionOrigins: SelectionOriginService;
	knowledgeLookup: Pick<KnowledgeLookup, 'search'>;
	embeddings: EmbeddingClient;
	reranker: Reranker;
	relationshipClassifier: RelationshipClassifier;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
	noteActionRequests: NoteActionRequests;
	runSettlements: RunSettlement;
	runEvents: Pick<AgentEventBus, 'notify'>;
	relationshipRules: RelationshipRules;
	relationshipGeneration: SelectionGeneration;
}

export class Relationships implements RelationshipsController {
	constructor(private readonly dependencies: RelationshipsDependencies) {}

	async startSuggestFromSelection(
		actor: ActorContext,
		input: StartRelateSelectionInput
	): Promise<AgentRunReceipt> {
		const request: NoteActionRequest = {
			requestId: input.requestId,
			context: {
				kind: 'related_notes',
				selection: input.selection,
				generation: this.dependencies.relationshipGeneration
			}
		};
		let receipt: AgentRunReceipt;
		try {
			receipt = await this.dependencies.transactionRunner.run(() =>
				this.dependencies.noteActionRequests.prepare(actor, request)
			);
		} catch (error) {
			if (!(error instanceof DuplicateNoteActionRequest)) throw error;
			receipt = await this.dependencies.noteActionRequests.existing(actor, request);
		}
		this.dependencies.runEvents.notify(receipt.runId);
		if (receipt.status === 'queued') this.launchRelatedNoteRun(actor, receipt.runId);
		return receipt;
	}

	private launchRelatedNoteRun(actor: ActorContext, runId: AgentRunId): void {
		// audit-allow: silent-catch — detached execution persists its terminal state; settlement failures are emitted for operational repair.
		void this.executeRelatedNoteRun(actor, runId).catch((error) =>
			console.error(`[related-note-run] Could not settle ${runId}:`, error)
		);
	}

	async recoverQueuedRelatedNoteRuns(): Promise<number> {
		const queued = await this.dependencies.noteActionRequests.queued('related_notes');
		for (const run of queued) this.launchRelatedNoteRun(run.actor, run.runId);
		return queued.length;
	}

	async executeRelatedNoteRun(actor: ActorContext, runId: AgentRunId): Promise<void> {
		const run = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.noteActionRequests.claim(actor, runId, 'related_notes')
		);
		if (!run) return;
		this.dependencies.runEvents.notify(runId);
		const active = registerActiveRun(runId);
		try {
			const input = run.contextSnapshot;
			const note = await this.dependencies.selectionOrigins.validate(actor, input.selection);
			const candidates = await this.findCandidates(
				actor,
				note,
				input.selection,
				input.generation,
				active.signal
			);
			active.signal.throwIfAborted();
			const saved = await this.dependencies.transactionRunner.run(async () => {
				const claim = await this.dependencies.runSettlements.claim(runId, {
					kind: 'completed',
					conversationId: run.conversationId,
					model: run.model
				});
				if (claim.kind === 'lost') return false;
				const result = await this.saveRelationships(actor, input, candidates);
				await this.dependencies.noteActionRequests.recordResult(runId, {
					action: 'relate',
					result
				});
				await this.dependencies.runSettlements.complete(claim);
				return true;
			});
			if (saved) this.dependencies.runEvents.notify(runId);
			else await this.settle(runId, { kind: 'cancelled', message: 'Related note search stopped' });
		} catch (error) {
			try {
				if (active.signal.aborted)
					await this.settle(runId, { kind: 'cancelled', message: 'Related note search stopped' });
				else {
					const failed = await this.settle(runId, {
						kind: 'failed',
						code: 'WORKFLOW_FAILED',
						message: error instanceof Error ? error.message : String(error),
						retryable: true
					});
					if (!failed)
						await this.settle(runId, { kind: 'cancelled', message: 'Related note search stopped' });
				}
			} catch (settlementError) {
				throw new AggregateError(
					[error, settlementError],
					'Related note search failed and could not be settled',
					{ cause: settlementError }
				);
			}
		} finally {
			releaseActiveRun(runId);
		}
	}

	private async settle(runId: AgentRunId, outcome: RunSettlementOutcome): Promise<boolean> {
		const saved = await this.dependencies.transactionRunner.run(async () => {
			const claim = await this.dependencies.runSettlements.claim(runId, outcome);
			if (claim.kind === 'lost') return false;
			await this.dependencies.runSettlements.complete(claim);
			return true;
		});
		if (saved) this.dependencies.runEvents.notify(runId);
		return saved;
	}

	async suggestFromSelection(
		actor: ActorContext,
		input: RelateSelectionInput,
		signal?: AbortSignal
	): Promise<RelateSelectionOutput<BacklinkSuggestion>> {
		const note = await this.dependencies.selectionOrigins.validate(actor, input.selection);
		const candidates = await this.findCandidates(
			actor,
			note,
			input.selection,
			this.dependencies.relationshipGeneration,
			signal
		);
		signal?.throwIfAborted();
		return this.dependencies.transactionRunner.run(() =>
			this.saveRelationships(actor, input, candidates)
		);
	}
	private async saveRelationships(
		actor: ActorContext,
		input: RelateSelectionInput,
		candidates: readonly LinkCandidate[]
	): Promise<RelateSelectionOutput<BacklinkSuggestion>> {
		const source = await this.dependencies.selectionOrigins.resolve(actor, input.selection);
		const { anchor } = source;
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
	}

	private async findCandidates(
		actor: ActorContext,
		note: Note,
		selection: TextSelection,
		generation: SelectionGeneration,
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
				const classification =
					generation.kind === 'rules'
						? await this.dependencies.relationshipRules.classify(selection.text, match.content)
						: await this.dependencies.relationshipClassifier.classify(
								selection.text,
								match.content,
								generation.model,
								signal
							);
				signal?.throwIfAborted();
				return relatedNoteCandidate(match, classification);
			})
		);
	}
}
