import type { ActorContext } from '$lib/models/identity';
import { AgentProviderFailure, toolActivityFromEvent } from '$lib/models/agent';
import type {
	AgentExecutionUpdate,
	AgentEvent,
	AgentRun,
	AgentRunContext,
	AgentRunDecisionRecord,
	AgentRunEventRecord,
	AgentRunId,
	ConversationId,
	PersistedSessionItem,
	PreparedAgentRun,
	RunAgentInput,
	ToolActivity,
	ToolClassification
} from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { DateTime } from '$lib/models/workspace';
import type { Provenance, ProvenanceId, ProvenanceRequest } from '$lib/models/provenance';
import type {
	AgentRunDecisionRepository,
	AgentRunEventRepository,
	AgentRunRepository
} from '$lib/server/repositories/agent';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
interface AgentContextBuilder {
	build(
		actor: ActorContext,
		input: RunAgentInput,
		run: { provenanceId: ProvenanceId }
	): Promise<AgentRunContext>;
}
/** Declared locally, matching the port in `./contracts`. */
interface AgentToolExecutor {
	execute(
		input: {
			readonly callId?: string;
			readonly toolName: ToolName;
			readonly arguments: AgentPayloadObject;
			readonly classification: ToolClassification;
		},
		action: () => Promise<AgentPayload>
	): Promise<AgentPayload>;
}
interface AgentRunner {
	execute(input: {
		readonly actor: ActorContext;
		readonly run: AgentRun;
		readonly request: RunAgentInput;
		readonly context: AgentRunContext;
		readonly decision?: AgentRunDecisionRecord;
		readonly signal: AbortSignal;
		readonly toolExecutor: AgentToolExecutor;
	}): AsyncIterable<AgentExecutionUpdate>;
}
interface ProvenanceRecorder {
	record(actor: ActorContext, input: ProvenanceRequest): Promise<Provenance>;
}
interface ConversationJournal {
	recordToolActivity(
		actor: ActorContext,
		conversationId: ConversationId,
		activity: ToolActivity,
		provenance?: { readonly runId: AgentRunId; readonly eventCursor?: string }
	): Promise<void>;
	recordAssistantText(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: { readonly runId: AgentRunId; readonly eventCursor?: string }
	): Promise<void>;
	recordAssistantReasoning(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: { readonly runId: AgentRunId; readonly eventCursor?: string }
	): Promise<void>;
}
interface AgentEventBus {
	notify(runId: AgentRunId): void;
}

export type AgentRunExecutionOutcome = 'completed' | 'awaiting_approval' | 'cancelled';

export interface AgentRunExecutorDependencies {
	readonly runs: AgentRunRepository;
	readonly events: AgentRunEventRepository;
	readonly decisions: AgentRunDecisionRepository;
	readonly sessions: AgentSessionRepository;
	readonly transactions: TransactionRunner;
	readonly contextBuilder: AgentContextBuilder;
	readonly provenance: ProvenanceRecorder;
	readonly conversations: ConversationJournal;
	readonly runner: AgentRunner;
	readonly eventBus: AgentEventBus;
}

export class AgentRunLifecycle {
	constructor(private readonly deps: AgentRunExecutorDependencies) {}

	async execute(runId: AgentRunId, signal: AbortSignal): Promise<AgentRunExecutionOutcome> {
		try {
			const run = await this.prepare(runId);
			if (!run) return 'cancelled';
			const actor: ActorContext = { userId: run.userId };
			const request = run.inputSnapshot;
			const decisions = await this.deps.decisions.loadUnconsumed(run.id);
			// Keyed by the provider's call id, so the stale-resource event can wait
			// for the matching outcome event and reach the client in the order it
			// expects. The id used to arrive as `''` when the provider sent none, so
			// two such mutations shared one key and the second overwrote the first.
			const successfulMutations = new Map<string, string>();
			const toolExecutor: AgentToolExecutor = {
				execute: async (input, action) => {
					const output = await action();
					if (input.classification !== 'mutation') return output;
					// Nothing will settle a call the provider gave no id for, so there
					// is nothing to wait for. The mutation already succeeded and its
					// resource is stale either way, so say so now rather than key it
					// under an id no outcome event can carry.
					if (input.callId === undefined)
						await this.persistEvent(run, actor, {
							type: 'resources_stale',
							resources: [input.toolName]
						});
					else successfulMutations.set(input.callId, input.toolName);
					return output;
				}
			};
			for await (const update of this.deps.runner.execute({
				actor,
				run,
				request,
				context: run.contextSnapshot,
				...(decisions.length > 0 ? { decisions } : {}),
				signal,
				toolExecutor
			})) {
				// A runner that swallows the abort and keeps yielding still settles
				// here, at the next boundary, instead of wedging in `cancelling`.
				if (signal.aborted) {
					await this.finishCancellation(run.id);
					return 'cancelled';
				}
				if (update.type === 'event') {
					await this.persistEvent(run, actor, update.event);
					const settled = update.event.type === 'tool_succeeded' ? update.event.callId : undefined;
					if (settled !== undefined) {
						const resource = successfulMutations.get(settled);
						if (resource) {
							successfulMutations.delete(settled);
							await this.persistEvent(run, actor, {
								type: 'resources_stale',
								resources: [resource]
							});
						}
					}
					continue;
				}
				if (update.type === 'approval_checkpoint') {
					let parked: AgentRun | undefined;
					await this.deps.transactions.run(async () => {
						await this.deps.sessions.replace(run.conversationId, update.sessionItems);
						for (const decision of decisions)
							await this.deps.decisions.consume(run.id, decision.callId, new Date());
						parked = await this.deps.runs.transition(run.id, 'running', 'awaiting_approval', {
							serializedState: update.serializedState,
							// Carried across the park so the resumed turn joins this run's
							// trace rather than opening a second one for the same request.
							...(update.traceparent ? { traceparent: update.traceparent } : {}),
							pendingDecisions: update.pendingDecisions,
							updatedAt: new Date().toISOString() as DateTime
						});
					});
					// The park lost the race with a cancellation: the row is `cancelling`,
					// so settle it rather than report a park that never happened.
					if (!parked) {
						await this.finishCancellation(run.id);
						return 'cancelled';
					}
					// Every other durable transition notifies; without this one a
					// subscriber waiting on the run reaching a terminal status never
					// learns it parked, because the preceding `approval_required`
					// event fires while the run is still `running`.
					this.deps.eventBus.notify(run.id);
					return 'awaiting_approval';
				}
				const settled = await this.complete(
					run,
					actor,
					update.sessionItems,
					decisions.map((decision) => decision.callId)
				);
				// Same race as the park above: completion arrived after the row was
				// already `cancelling`, so the cancel wins.
				if (!settled) {
					await this.finishCancellation(run.id);
					return 'cancelled';
				}
				return 'completed';
			}
			throw new Error('The agent provider ended without a durable outcome');
		} catch (error) {
			// A cancel that lands mid-prepare turns the snapshot write into an
			// illegal `cancelling → running` update, and the abort can lag the
			// commit that parked the row. Either way the run is settling, not
			// failing; `finishCancellation` no-ops for any other status, so a
			// settled row is what distinguishes the race from a real failure.
			const settled = await this.finishCancellation(runId);
			if (signal.aborted || settled) return 'cancelled';
			throw error;
		}
	}

	/**
	 * Settles a run the user asked to stop. `cancelling` is the only legal
	 * predecessor of `cancelled`, and the caller commits that write before
	 * aborting, so by the time this runs the row is already parked there.
	 * Returns undefined when the run settled on its own first.
	 */
	async finishCancellation(runId: AgentRunId): Promise<AgentRun | undefined> {
		const cancelled = await this.deps.transactions.run(async () => {
			// The compare-and-set leads so a run that completed in the same instant
			// is left alone rather than gaining an orphan `cancelled` event.
			// `pendingDecisions` is cleared by `abandonPendingCalls` rather than here,
			// which needs to read them off the settled row first.
			const settled = await this.deps.runs.transition(runId, 'cancelling', 'cancelled', {
				finishedAt: new Date().toISOString() as DateTime,
				failure: 'The request was cancelled'
			});
			if (!settled) return undefined;
			await this.abandonPendingCalls(settled, 'The request was cancelled before you answered.');
			await this.deps.decisions.clearPending(runId);
			await this.deps.events.append(runId, 1, {
				type: 'cancelled',
				runId,
				message: 'Generation stopped'
			});
			return settled;
		});
		if (cancelled) this.deps.eventBus.notify(runId);
		return cancelled;
	}

	/**
	 * Settles a run whose background execution threw. Without this a crashed run
	 * stays `running` forever, holding the conversation's single active-run slot
	 * and keeping its event stream open.
	 */
	// audit-allow: no-unknown-type — TypeScript types a caught error as unknown; this settles a run from one.
	async failRun(runId: AgentRunId, error: unknown): Promise<void> {
		try {
			const code = error instanceof AgentProviderFailure ? error.providerCode : 'INTERNAL';
			const message = error instanceof Error ? error.message : String(error);
			const failed = await this.deps.transactions.run(async () => {
				const settled = await this.deps.runs.transition(runId, 'running', 'failed', {
					finishedAt: new Date().toISOString() as DateTime,
					failure: message,
					providerErrorCode: code
				});
				if (!settled) return undefined;
				await this.abandonPendingCalls(settled, 'The run ended before you answered this.');
				await this.deps.events.append(runId, 1, {
					type: 'failed',
					runId,
					code,
					message,
					// Nothing re-queues a run on its own, so the client must show the
					// failure and offer the explicit retry rather than keep waiting.
					retryable: false
				});
				return settled;
			});
			if (failed) {
				this.deps.eventBus.notify(runId);
				return;
			}
			// Not `running`: either the user asked to stop and the run is parked in
			// `cancelling`, or it already settled. Both are handled by the no-op
			// compare-and-set below.
			await this.finishCancellation(runId);
		} catch (settlementError) {
			throw new AggregateError(
				[error, settlementError],
				`Agent run ${runId} failed and its failure could not be persisted`,
				{ cause: settlementError }
			);
		}
	}

	private async prepare(runId: AgentRunId): Promise<PreparedAgentRun | undefined> {
		const transitioned = await this.deps.runs.transitionAgent(runId, 'queued', 'running', {
			startedAt: new Date().toISOString() as DateTime
		});
		if (!transitioned) return undefined;
		let run = transitioned;
		const actor: ActorContext = { userId: run.userId };

		if (!run.provenanceId) {
			const provenance = await this.deps.provenance.record(actor, {
				producerKind: 'agent',
				producerName: 'FollowThrough Workbench Agent',
				pipeline: 'agent',
				runId: run.id,
				model: run.model,
				metadata: {}
			});
			run = { ...run, provenanceId: provenance.id };
			await this.deps.runs.update(actor, run);
		}

		if (!run.contextSnapshot) {
			const context = await this.deps.contextBuilder.build(actor, run.inputSnapshot, {
				provenanceId: run.provenanceId!
			});
			run = { ...run, contextSnapshot: context };
			await this.deps.runs.update(actor, run);
		}

		await this.deps.events.append(run.id, 1, {
			type: 'run_started',
			runId: run.id,
			attempt: 1
		});
		this.deps.eventBus.notify(run.id);

		return run as PreparedAgentRun;
	}

	/**
	 * Settles the calls a run was parked on when the run itself ends without them being
	 * answered. The journal is append-only, so a call's last written row is its status
	 * forever: a run that died holding an approval left that row saying `approval_required`
	 * and nothing ever contradicted it. Reopening the conversation then replayed a live
	 * Approve/Reject card for a run that could not act on either answer.
	 *
	 * The actor comes off the run row rather than the caller, because the two paths into
	 * here — a crash and a cancellation — both start from a run id alone.
	 */
	private async abandonPendingCalls(run: AgentRun, failure: string): Promise<void> {
		if (run.pendingDecisions.length === 0) return;
		const actor: ActorContext = { userId: run.userId };
		for (const pending of run.pendingDecisions)
			await this.deps.conversations.recordToolActivity(
				actor,
				run.conversationId,
				{
					callId: pending.callId,
					name: pending.toolName,
					input: pending.arguments,
					failure,
					status: 'failed'
				},
				{ runId: run.id }
			);
		await this.deps.runs.update(actor, { ...run, pendingDecisions: [] });
	}

	private async persistEvent(
		run: AgentRun,
		actor: ActorContext,
		event: AgentEvent
	): Promise<AgentRunEventRecord> {
		const record = await this.deps.transactions.run(async () => {
			const record = await this.deps.events.append(run.id, 1, event);
			const activity = toolActivityFromEvent(event);
			if (activity)
				await this.deps.conversations.recordToolActivity(actor, run.conversationId, activity, {
					runId: run.id,
					eventCursor: record.cursor
				});
			return record;
		});
		this.deps.eventBus.notify(run.id);
		return record;
	}

	private async complete(
		run: AgentRun,
		actor: ActorContext,
		sessionItems: readonly PersistedSessionItem[],
		decisionCallIds: readonly string[] = []
	): Promise<boolean> {
		const settled = await this.deps.transactions.run(async () => {
			await this.deps.sessions.replace(run.conversationId, sessionItems);
			for (const callId of decisionCallIds)
				await this.deps.decisions.consume(run.id, callId, new Date());
			// One message per contiguous run of output, each carrying the cursor it began at.
			// Written as a single blob it could only be replayed after every tool call, which
			// is why a reopened conversation read as "all the work, then all the words".
			const segments = await this.deps.events.reconstructOutput(run.id, 1);
			for (const segment of segments) {
				const provenance = { runId: run.id, eventCursor: segment.cursor };
				if (segment.kind === 'reasoning')
					await this.deps.conversations.recordAssistantReasoning(
						actor,
						run.conversationId,
						segment.text,
						run.model,
						provenance
					);
				else
					await this.deps.conversations.recordAssistantText(
						actor,
						run.conversationId,
						segment.text,
						run.model,
						provenance
					);
			}
			return this.deps.runs.transition(run.id, 'running', 'completed', {
				serializedState: undefined,
				pendingDecisions: [],
				finishedAt: new Date().toISOString() as DateTime
			});
		});
		if (settled) this.deps.eventBus.notify(run.id);
		return settled !== undefined;
	}
}
