import { DuplicateNoteActionRequest } from '$lib/errors';
import type { Note, TextSelection } from '$lib/models/notes';
import type {
	LinkCandidate,
	RelateSelectionInput,
	RelateSelectionOutput,
	StartRelateSelectionInput
} from '$lib/models/relationships';
import type { BacklinkSuggestion } from '$lib/models/suggestions';
import type { RelationshipCandidates } from '$lib/services/relationships/candidates';

import type {
	AgentRunId,
	AgentRunReceipt,
	NoteActionRequest,
	RunSettlementOutcome,
	SelectionGeneration
} from '$lib/models/agent';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import { type NoteActionSubmission } from '$lib/server/services/agent/runs/note-action-requests';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { KnowledgeSearch } from '$lib/server/services/knowledge-search/retrieval';
import type { SelectionOriginService } from '$lib/server/services/notes/selection-origin';
import type { RelationshipClassifier } from '$lib/server/services/relationships/discovery';
import type { RelationshipRuleClassifier } from '$lib/server/services/relationships/rules';
import type { SuggestionCreator } from '$lib/server/services/suggestions/inbox';
import type { RunSignals } from '$lib/server/services/agent/runs/signals';

/**
 * Application boundary for relationship (backlink) suggestions between notes: find notes
 * related to a text selection and create reviewable backlink suggestions, all in one
 * transaction with provenance tying each suggestion back to the selection's anchor.
 */
export interface RelationshipsController {
	suggestFromSelection(
		input: RelateSelectionInput,
		signal?: AbortSignal
	): Promise<RelateSelectionOutput<BacklinkSuggestion>>;
	/**
	 * Start {@link suggestFromSelection} as a cancellable run, returning once the run
	 * is durable. Its result arrives as a `workflow_result` event, so a refresh mid-run
	 * still collects the suggestions.
	 */
	startSuggestFromSelection(input: StartRelateSelectionInput): Promise<AgentRunReceipt>;
	executeRelatedNoteRun(runId: AgentRunId): Promise<void>;
	/** Start a queued run the previous process never started. */
	resumeQueuedRelatedNoteRun(runId: AgentRunId): Promise<void>;
}

export interface RelationshipsDependencies {
	selectionOrigins: SelectionOriginService;
	knowledge: KnowledgeSearch;
	relationshipClassifier: RelationshipClassifier;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
	noteActionRequests: NoteActionSubmission;
	runSettlements: RunSettlement;
	runSignals: RunSignals;
	relationshipRules: RelationshipRuleClassifier;
	relationshipGeneration: SelectionGeneration;
}

export class Relationships implements RelationshipsController {
	constructor(
		private readonly relationshipCandidates: RelationshipCandidates,
		private readonly dependencies: RelationshipsDependencies
	) {}

	async startSuggestFromSelection(input: StartRelateSelectionInput): Promise<AgentRunReceipt> {
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
				this.dependencies.noteActionRequests.prepare(request)
			);
		} catch (error) {
			if (!(error instanceof DuplicateNoteActionRequest)) throw error;
			receipt = await this.dependencies.noteActionRequests.existing(request);
		}
		if (receipt.status === 'queued') this.launchRelatedNoteRun(receipt.runId);
		return receipt;
	}

	private launchRelatedNoteRun(runId: AgentRunId): void {
		// audit-allow: silent-catch — detached execution persists its terminal state; settlement failures are emitted for operational repair.
		void this.executeRelatedNoteRun(runId).catch((error) =>
			console.error(`[related-note-run] Could not settle ${runId}:`, error)
		);
	}

	async resumeQueuedRelatedNoteRun(runId: AgentRunId): Promise<void> {
		this.launchRelatedNoteRun(runId);
	}

	async executeRelatedNoteRun(runId: AgentRunId): Promise<void> {
		const run = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.noteActionRequests.claim(runId, 'related_notes')
		);
		if (!run) return;
		const active = new AbortController();
		let stopWatching = async () => {};
		try {
			stopWatching = await this.dependencies.runSignals.abortOnCancel(runId, active);
			const input = run.contextSnapshot;
			const note = await this.dependencies.selectionOrigins.validate(input.selection);
			const candidates = await this.findCandidates(
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
				const result = await this.saveRelationships(input, candidates);
				await this.dependencies.noteActionRequests.recordResult(runId, {
					action: 'relate',
					result
				});
				await this.dependencies.runSettlements.complete(claim);
				return true;
			});
			if (!saved)
				await this.settle(runId, { kind: 'cancelled', message: 'Related note search stopped' });
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
			await stopWatching();
		}
	}

	private async settle(runId: AgentRunId, outcome: RunSettlementOutcome): Promise<boolean> {
		const saved = await this.dependencies.transactionRunner.run(async () => {
			const claim = await this.dependencies.runSettlements.claim(runId, outcome);
			if (claim.kind === 'lost') return false;
			await this.dependencies.runSettlements.complete(claim);
			return true;
		});
		return saved;
	}

	async suggestFromSelection(
		input: RelateSelectionInput,
		signal?: AbortSignal
	): Promise<RelateSelectionOutput<BacklinkSuggestion>> {
		const note = await this.dependencies.selectionOrigins.validate(input.selection);
		const candidates = await this.findCandidates(
			note,
			input.selection,
			this.dependencies.relationshipGeneration,
			signal
		);
		signal?.throwIfAborted();
		return this.dependencies.transactionRunner.run(() => this.saveRelationships(input, candidates));
	}
	private async saveRelationships(
		input: RelateSelectionInput,
		candidates: readonly LinkCandidate[]
	): Promise<RelateSelectionOutput<BacklinkSuggestion>> {
		const source = await this.dependencies.selectionOrigins.resolve(input.selection);
		const { anchor } = source;
		const origin = await this.dependencies.selectionOrigins.record(source, {
			producerKind: 'pipeline',
			producerName: 'Relate',
			pipeline: 'relate',
			metadata: {}
		});
		const suggestions = await Promise.all(
			candidates.map((candidate) =>
				this.dependencies.suggestionCreator.createFromSelection(origin, {
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
		note: Note,
		selection: TextSelection,
		generation: SelectionGeneration,
		signal?: AbortSignal
	): Promise<readonly LinkCandidate[]> {
		signal?.throwIfAborted();
		if (!selection.text.trim()) return [];
		const matches = await this.dependencies.knowledge.retrieve(selection.text, {
			limit: 12,
			projectId: note.projectId,
			signal
		});
		signal?.throwIfAborted();
		return Promise.all(
			this.relationshipCandidates.relatedNoteMatches(note.id, matches).map(async (match) => {
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
				return this.relationshipCandidates.relatedNoteCandidate(match, classification);
			})
		);
	}
}
