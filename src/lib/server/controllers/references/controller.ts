import { DuplicateNoteActionRequest } from '$lib/errors';
import type {
	AgentRunId,
	AgentRunReceipt,
	NoteActionRequest,
	RunSettlementOutcome
} from '$lib/models/agent';
import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { ActorContext } from '$lib/models/identity';
import type { TextSelection } from '$lib/models/notes';
import type {
	FindReferencesInput,
	FindReferencesOutput,
	ReferenceCandidate,
	ReferenceSearchOptions,
	StartFindReferencesInput
} from '$lib/models/references';
import type { ReferenceSuggestion } from '$lib/models/suggestions';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { ReferenceFinder } from '$lib/server/controllers/references/search';
import { type NoteActionSubmission } from '$lib/server/services/agent/runs/note-action-requests';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { SelectionOriginService } from '$lib/server/services/notes/selection-origin';
import type { ReferenceRanker } from '$lib/server/services/references/ranking';
import type { SuggestionCreator } from '$lib/server/services/suggestions/inbox';
import { activeRunStore } from '$lib/server/stores/agent/active-runs';
import type { AgentEventBus } from '$lib/server/stores/agent/events';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';

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

	agentFindReferences(
		actor: ActorContext,
		selection: TextSelection,
		model: string,
		input: AgentToolInput<'find_references'>
	): Promise<AgentPayload>;
}

export interface ReferencesDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	selectionOrigins: SelectionOriginService;
	referenceFinder: ReferenceFinder;
	referenceRanker: ReferenceRanker;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
	noteActionRequests: NoteActionSubmission;
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
		const request: NoteActionRequest = {
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
				this.dependencies.noteActionRequests.prepare(actor, request)
			);
		} catch (error) {
			if (!(error instanceof DuplicateNoteActionRequest)) throw error;
			receipt = await this.dependencies.noteActionRequests.existing(actor, request);
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
		const queued = await this.dependencies.noteActionRequests.queued('reference_search');
		for (const run of queued) this.launchReferenceRun(run.actor, run.runId);
		return queued.length;
	}

	async executeReferenceRun(actor: ActorContext, runId: AgentRunId): Promise<void> {
		const run = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.noteActionRequests.claim(actor, runId, 'reference_search')
		);
		if (!run) return;
		this.dependencies.runEvents.notify(runId);
		const active = new AbortController();
		activeRunStore.register(runId, active);
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
				await this.dependencies.noteActionRequests.recordResult(runId, {
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
			activeRunStore.release(runId, active);
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

	async agentFindReferences(
		actor: ActorContext,
		selection: TextSelection,
		model: string,
		input: AgentToolInput<'find_references'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return {
				...(await this.suggestFromSelection(actor, { selection: selection }, { model: model })),
				sourceNoteId: selection.noteId
			};
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}
