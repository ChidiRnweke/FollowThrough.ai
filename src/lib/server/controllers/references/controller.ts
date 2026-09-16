import type { ReferenceSuggestion } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type {
	FindReferencesInput,
	FindReferencesOutput,
	StartFindReferencesInput,
	ReferenceCandidate
} from '$lib/models/references';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	ReferenceFinder,
	ReferenceRanker,
	ReferenceSearchOptions
} from '$lib/server/services/references/contracts';
import type { SelectionOriginService } from '$lib/server/services/notes/contracts';
import type { SuggestionCreator } from '$lib/server/services/suggestions/contracts';
import type {
	AgentRunReceipt,
	AgentRunId,
	RunSettlementOutcome,
	SelectionActionRequest
} from '$lib/models/agent';
import {
	DuplicateSelectionRequest,
	type SelectionRequests
} from '$lib/server/services/agent/runs/selection-requests';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { AgentEventBus } from '$lib/server/services/agent/runs/events';
import { registerActiveRun, releaseActiveRun } from '$lib/server/services/agent/runs/active-runs';

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
		input: StartFindReferencesInput
	): Promise<AgentRunReceipt>;
	executeReferenceRun(actor: ActorContext, runId: AgentRunId): Promise<void>;
	recoverQueuedReferenceRuns(): Promise<number>;
}

export interface ReferencesDependencies {
	selectionOrigins: SelectionOriginService;
	referenceFinder: ReferenceFinder;
	referenceRanker: ReferenceRanker;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
	selectionRequests: SelectionRequests;
	runSettlements: RunSettlement;
	runEvents: Pick<AgentEventBus, 'notify'>;
	referenceModel: string;
}

export class References implements ReferencesController {
	constructor(private readonly dependencies: ReferencesDependencies) {}

	async startSuggestFromSelection(
		actor: ActorContext,
		input: StartFindReferencesInput
	): Promise<AgentRunReceipt> {
		const request: SelectionActionRequest = {
			requestId: input.requestId,
			context: {
				kind: 'reference_search',
				selection: input.selection,
				model: this.dependencies.referenceModel
			}
		};
		let receipt: AgentRunReceipt;
		try {
			receipt = await this.dependencies.transactionRunner.run(() =>
				this.dependencies.selectionRequests.prepare(actor, request)
			);
		} catch (error) {
			if (!(error instanceof DuplicateSelectionRequest)) throw error;
			receipt = await this.dependencies.selectionRequests.existing(actor, request);
		}
		this.dependencies.runEvents.notify(receipt.runId);
		if (receipt.status === 'queued') this.launchReferenceRun(actor, receipt.runId);
		return receipt;
	}

	private launchReferenceRun(actor: ActorContext, runId: AgentRunId): void {
		// audit-allow: silent-catch — detached execution persists its terminal state; settlement failures are emitted for operational repair.
		void this.executeReferenceRun(actor, runId).catch((error) =>
			console.error(`[reference-run] Could not settle ${runId}:`, error)
		);
	}

	async recoverQueuedReferenceRuns(): Promise<number> {
		const queued = await this.dependencies.selectionRequests.queued('reference_search');
		for (const run of queued) this.launchReferenceRun(run.actor, run.runId);
		return queued.length;
	}

	async executeReferenceRun(actor: ActorContext, runId: AgentRunId): Promise<void> {
		const run = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.selectionRequests.claim(actor, runId, 'reference_search')
		);
		if (!run) return;
		this.dependencies.runEvents.notify(runId);
		const active = registerActiveRun(runId);
		try {
			const input = run.contextSnapshot;
			const ranked = await this.findCandidates(actor, input, {
				model: input.model,
				signal: active.signal
			});
			active.signal.throwIfAborted();
			const saved = await this.dependencies.transactionRunner.run(async () => {
				const claim = await this.dependencies.runSettlements.claim(runId, {
					kind: 'completed',
					conversationId: run.conversationId,
					model: run.model
				});
				if (claim.kind === 'lost') return false;
				const result = await this.saveReferences(actor, input, ranked);
				await this.dependencies.selectionRequests.recordResult(runId, {
					action: 'reference',
					result
				});
				await this.dependencies.runSettlements.complete(claim);
				return true;
			});
			if (saved) this.dependencies.runEvents.notify(runId);
			else await this.settle(runId, { kind: 'cancelled', message: 'Reference search stopped' });
		} catch (error) {
			try {
				if (active.signal.aborted)
					await this.settle(runId, { kind: 'cancelled', message: 'Reference search stopped' });
				else {
					const failed = await this.settle(runId, {
						kind: 'failed',
						code: 'WORKFLOW_FAILED',
						message: error instanceof Error ? error.message : String(error),
						retryable: true
					});
					if (!failed)
						await this.settle(runId, { kind: 'cancelled', message: 'Reference search stopped' });
				}
			} catch (settlementError) {
				throw new AggregateError(
					[error, settlementError],
					'Reference search failed and could not be settled',
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
		input: FindReferencesInput,
		options?: ReferenceSearchOptions
	): Promise<FindReferencesOutput<ReferenceSuggestion>> {
		const ranked = await this.findCandidates(actor, input, options);
		options?.signal?.throwIfAborted();
		return this.dependencies.transactionRunner.run(() => this.saveReferences(actor, input, ranked));
	}

	private async findCandidates(
		actor: ActorContext,
		input: FindReferencesInput,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[]> {
		await this.dependencies.selectionOrigins.validate(actor, input.selection);
		const found = await this.dependencies.referenceFinder.find(actor, input.selection, {
			model: options?.model ?? this.dependencies.referenceModel,
			...(options?.signal ? { signal: options.signal } : {})
		});
		options?.signal?.throwIfAborted();
		return this.dependencies.referenceRanker.rank(found);
	}

	private async saveReferences(
		actor: ActorContext,
		input: FindReferencesInput,
		ranked: readonly ReferenceCandidate[]
	): Promise<FindReferencesOutput<ReferenceSuggestion>> {
		const source = await this.dependencies.selectionOrigins.resolve(actor, input.selection);
		const { anchor } = source;
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
	}
}
