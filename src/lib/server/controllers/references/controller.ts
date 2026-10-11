import type { WebReferenceClient } from '$lib/server/services/references/web-research';
import { DuplicateNoteActionRequest } from '$lib/errors';
import type {
	AgentRunId,
	AgentRunReceipt,
	NoteActionRequest,
	RunSettlementOutcome
} from '$lib/models/agent';
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
import type { ReferenceCandidatePreparation } from '$lib/server/services/references/discovery';
import type { AgentRunSettings } from '$lib/services/agent/run-settings';
import { REFERENCE_WEB_SEARCH_DEFAULTS, type WebResearchOptions } from '$lib/models/agent';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import { type NoteActionSubmission } from '$lib/server/services/agent/runs/note-action-requests';
import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { SelectionOriginService } from '$lib/server/services/notes/selection-origin';
import type { ReferenceRanker } from '$lib/server/services/references/ranking';
import type { SuggestionCreator } from '$lib/server/services/suggestions/inbox';
import type { RunSignals } from '$lib/server/services/agent/runs/signals';

/**
 * Application boundary for reference suggestions: given a text selection, find and rank
 * relevant external references and create reviewable suggestions, all in one
 * transaction so the anchor, provenance, and suggestions land atomically or not at all.
 */
export interface ReferencesController {
	suggestFromSelection(
		input: FindReferencesInput,
		options?: ReferenceSearchOptions
	): Promise<FindReferencesOutput<ReferenceSuggestion>>;
	/**
	 * Start {@link suggestFromSelection} as a cancellable run, returning once the run
	 * is durable. Its result arrives as a `workflow_result` event, so a refresh mid-run
	 * still collects the suggestions.
	 */
	startSuggestFromSelection(input: StartFindReferencesInput): Promise<AgentRunReceipt>;
	executeReferenceRun(runId: AgentRunId): Promise<void>;
	/** Start a queued run the previous process never started. */
	resumeQueuedReferenceRun(runId: AgentRunId): Promise<void>;
}

export interface ReferencesDependencies {
	selectionOrigins: SelectionOriginService;
	referenceClient: WebReferenceClient;
	referenceCandidates: ReferenceCandidatePreparation;
	researchSettings: AgentRunSettings;
	researchOverrides: WebResearchOptions;
	referenceRanker: ReferenceRanker;
	suggestionCreator: SuggestionCreator;
	transactionRunner: TransactionRunner;
	noteActionRequests: NoteActionSubmission;
	runSettlements: RunSettlement;
	runSignals: RunSignals;
	referenceModel: string;
}

export class References implements ReferencesController {
	constructor(private readonly dependencies: ReferencesDependencies) {}

	async startSuggestFromSelection(input: StartFindReferencesInput): Promise<AgentRunReceipt> {
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
				this.dependencies.noteActionRequests.prepare(request)
			);
		} catch (error) {
			if (!(error instanceof DuplicateNoteActionRequest)) throw error;
			receipt = await this.dependencies.noteActionRequests.existing(request);
		}
		if (receipt.status === 'queued') this.launchReferenceRun(receipt.runId);
		return receipt;
	}

	private launchReferenceRun(runId: AgentRunId): void {
		// audit-allow: silent-catch — detached execution persists its terminal state; settlement failures are emitted for operational repair.
		void this.executeReferenceRun(runId).catch((error) =>
			console.error(`[reference-run] Could not settle ${runId}:`, error)
		);
	}

	async resumeQueuedReferenceRun(runId: AgentRunId): Promise<void> {
		this.launchReferenceRun(runId);
	}

	async executeReferenceRun(runId: AgentRunId): Promise<void> {
		const run = await this.dependencies.transactionRunner.run(() =>
			this.dependencies.noteActionRequests.claim(runId, 'reference_search')
		);
		if (!run) return;
		const active = new AbortController();
		let stopWatching = async () => {};
		try {
			stopWatching = await this.dependencies.runSignals.abortOnCancel(runId, active);
			const input = run.contextSnapshot;
			const ranked = await this.findCandidates(input, {
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
				const result = await this.saveReferences(input, ranked);
				await this.dependencies.noteActionRequests.recordResult(runId, {
					action: 'reference',
					result
				});
				await this.dependencies.runSettlements.complete(claim);
				return true;
			});
			if (!saved)
				await this.settle(runId, { kind: 'cancelled', message: 'Reference search stopped' });
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
		input: FindReferencesInput,
		options?: ReferenceSearchOptions
	): Promise<FindReferencesOutput<ReferenceSuggestion>> {
		const ranked = await this.findCandidates(input, options);
		options?.signal?.throwIfAborted();
		return this.dependencies.transactionRunner.run(() => this.saveReferences(input, ranked));
	}

	private async findCandidates(
		input: FindReferencesInput,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[]> {
		await this.dependencies.selectionOrigins.validate(input.selection);
		const found = await this.searchReferences(input.selection, {
			model: options?.model ?? this.dependencies.referenceModel,
			...(options?.signal ? { signal: options.signal } : {})
		});
		options?.signal?.throwIfAborted();
		return this.dependencies.referenceRanker.rank(found);
	}

	private async searchReferences(
		selection: TextSelection,
		options: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[]> {
		try {
			const research = this.dependencies.researchSettings.research(
				this.dependencies.researchOverrides,
				REFERENCE_WEB_SEARCH_DEFAULTS
			);
			const sources = await this.dependencies.referenceClient.search(
				selection.text,
				research,
				options
			);
			if (!sources)
				throw new InvalidGeneratedContentError('The provider returned no usable reference output');
			return this.dependencies.referenceCandidates.prepare(sources, selection.text);
		} catch (error) {
			if (options.signal?.aborted) throw error;
			if (error instanceof InvalidGeneratedContentError || error instanceof ExternalServiceError)
				throw error;
			throw new ExternalServiceError('Reference search failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
	private async saveReferences(
		input: FindReferencesInput,
		ranked: readonly ReferenceCandidate[]
	): Promise<FindReferencesOutput<ReferenceSuggestion>> {
		const source = await this.dependencies.selectionOrigins.resolve(input.selection);
		const { anchor } = source;
		if (ranked.length === 0) return { outcome: 'nothing_relevant', anchorId: anchor.id };
		const origin = await this.dependencies.selectionOrigins.record(source, {
			producerKind: 'pipeline',
			producerName: 'Reference',
			pipeline: 'reference',
			metadata: {}
		});
		const suggestions = await Promise.all(
			ranked.map((candidate) =>
				this.dependencies.suggestionCreator.createFromSelection(origin, {
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
