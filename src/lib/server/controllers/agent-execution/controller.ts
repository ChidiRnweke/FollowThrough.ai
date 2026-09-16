import type { RunSettlement } from '$lib/server/services/agent/runs/settlement';
import type { ActorContext } from '$lib/models/identity';
import { AgentProviderFailure, NotFoundError } from '$lib/errors';
import type { AgentContext } from '$lib/server/services/agent/runs/context';
import type { NoteReader } from '$lib/server/services/notes/contracts';
import type { BuiltInSkillProvisioner, SkillFinder } from '$lib/server/services/skills/contracts';
import type { MemoryLibrary } from '$lib/server/services/memory/library';
import type { ProjectReader } from '$lib/server/services/projects/contracts';
import type { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import type { NoteId } from '$lib/models/notes';
import { toolActivityFromEvent } from '$lib/models/agent';
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
import type { Provenance, ProvenanceRequest } from '$lib/models/provenance';
import type {
	AgentRunDecisionRepository,
	AgentRunEventRepository,
	AgentRunRepository
} from '$lib/server/services/agent/runs/execution-contracts';
import type { AgentSessionRepository } from '$lib/server/services/agent/runs/execution-contracts';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
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

import type { AgentRunExecutionOutcome } from '$lib/server/services/agent/runs/execution-contracts';

export interface AgentRunExecutorDependencies {
	readonly runs: AgentRunRepository;
	readonly settlements: RunSettlement;
	readonly events: AgentRunEventRepository;
	readonly decisions: AgentRunDecisionRepository;
	readonly sessions: AgentSessionRepository;
	readonly transactions: TransactionRunner;
	readonly contextFormatter: AgentContext;
	readonly contextNotes: NoteReader;
	readonly contextSkills: Pick<SkillFinder, 'listEnabled'>;
	readonly builtInSkills: Pick<BuiltInSkillProvisioner, 'ensure'>;
	readonly contextMemory: Pick<MemoryLibrary, 'list'>;
	readonly contextProjects: ProjectReader;
	readonly contextConversations: Pick<ConversationArchive, 'get'>;
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
			const toolExecutor: AgentToolExecutor = {
				execute: async (input, action) => {
					const output = await action();
					if (input.classification !== 'mutation') return output;
					await this.persistEvent(run, actor, {
						type: 'resources_stale',
						resources: ['workspace']
					});
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
					continue;
				}
				if (update.type === 'approval_checkpoint') {
					let parked: AgentRun | undefined;
					await this.deps.transactions.run(async () => {
						parked = await this.deps.runs.transition(run.id, 'running', 'awaiting_approval', {
							serializedState: update.serializedState,
							// Carried across the park so the resumed turn joins this run's
							// trace rather than opening a second one for the same request.
							...(update.traceparent ? { traceparent: update.traceparent } : {}),
							pendingDecisions: update.pendingDecisions,
							updatedAt: new Date().toISOString() as DateTime
						});
						if (!parked) return;
						await this.deps.sessions.replace(run.conversationId, update.sessionItems);
						for (const decision of decisions)
							await this.deps.decisions.consume(run.id, decision.callId, new Date());
						for (const pending of update.pendingDecisions) {
							const event: AgentEvent = {
								type: 'approval_required',
								runId: run.id,
								callId: pending.callId,
								name: pending.toolName,
								arguments: pending.arguments,
								...(pending.review ? { review: pending.review } : {})
							};
							const record = await this.deps.events.append(run.id, 1, event);
							const activity = toolActivityFromEvent(event);
							if (activity)
								await this.deps.conversations.recordToolActivity(
									actor,
									run.conversationId,
									activity,
									{ runId: run.id, eventCursor: record.cursor }
								);
						}
					});
					// The park lost the race with a cancellation: the row is `cancelling`,
					// so settle it rather than report a park that never happened.
					if (!parked) {
						await this.finishCancellation(run.id);
						return 'cancelled';
					}
					// Publish only after the checkpoint and its approval events commit together.
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
		const result = await this.deps.transactions.run(async () => {
			const settlement = await this.deps.settlements.claim(runId, {
				kind: 'cancelled',
				message: 'Generation stopped'
			});
			if (settlement.kind === 'lost') return settlement;
			const run = settlement.run;

			await this.abandonPendingCalls(run, 'The request was cancelled before you answered.');
			await this.deps.decisions.clearPending(runId);

			return this.deps.settlements.complete(settlement);
		});
		if (result.kind === 'lost') return undefined;
		this.deps.eventBus.notify(runId);
		return result.run;
	}

	/**
	 * Settles a run whose background execution threw. Without this a crashed run
	 * stays `running` forever, holding the conversation's single active-run slot
	 * and keeping its event stream open.
	 */
	async failRun(runId: AgentRunId, error: Error): Promise<void> {
		try {
			const code = error instanceof AgentProviderFailure ? error.providerCode : 'INTERNAL';
			const message = error.message;
			const failed = await this.deps.transactions.run(async () => {
				const settlement = await this.deps.settlements.claim(runId, {
					kind: 'failed',
					code,
					message,
					retryable: false
				});
				if (settlement.kind === 'lost') return settlement;
				const run = settlement.run;

				await this.abandonPendingCalls(run, 'The run ended before you answered this.');

				return this.deps.settlements.complete(settlement);
			});
			if (failed.kind === 'settled') {
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
			const context = await this.buildContext(actor, run.inputSnapshot);
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

	private async buildContext(actor: ActorContext, input: RunAgentInput): Promise<AgentRunContext> {
		await this.deps.transactions.run(() => this.deps.builtInSkills.ensure(actor));
		const current = input.noteId
			? { kind: 'note' as const, note: await this.deps.contextNotes.get(actor, input.noteId) }
			: { kind: 'no_current_note' as const };
		const base = this.deps.contextFormatter.base(input, current);
		const [skills, contextNotes, profileMemory] = await Promise.all([
			this.deps.contextSkills.listEnabled(actor, base.projectId),
			Promise.all(
				(input.contextNoteIds ?? []).map((noteId) => this.loadAttachedNote(actor, noteId))
			),
			this.deps.contextMemory.list(actor, {})
		]);
		if (!input.appContext)
			return this.deps.contextFormatter.build(input, { base, skills, contextNotes, profileMemory });
		const conversation = await this.deps.contextConversations.get(actor, input.conversationId);
		const origin = conversation.contextProjectId
			? {
					kind: 'project' as const,
					project: await this.deps.contextProjects.get(actor, conversation.contextProjectId)
				}
			: { kind: 'no_origin_project' as const };
		const appContext = this.deps.contextFormatter.appContext(
			input.appContext,
			conversation,
			origin
		);
		if (!input.requestedScope)
			return this.deps.contextFormatter.build(input, {
				base,
				skills,
				contextNotes,
				profileMemory,
				appContext
			});
		const requested = input.requestedScope;
		const [project, note] = await Promise.all([
			requested.projectId ? this.deps.contextProjects.get(actor, requested.projectId) : undefined,
			requested.noteId ? this.deps.contextNotes.get(actor, requested.noteId) : undefined
		]);
		const requestedScope = this.deps.contextFormatter.requestedScope(input.appContext, {
			project,
			note
		});
		return this.deps.contextFormatter.build(input, {
			base,
			skills,
			contextNotes,
			profileMemory,
			appContext: { ...appContext, requestedScope }
		});
	}

	private async loadAttachedNote(actor: ActorContext, noteId: NoteId) {
		try {
			return await this.deps.contextNotes.get(actor, noteId);
		} catch (error) {
			if (!(error instanceof NotFoundError)) throw error;
			throw new NotFoundError(
				'An attached note is no longer available. Remove it from context and retry.',
				{ noteId }
			);
		}
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
			const settlement = await this.deps.settlements.claim(run.id, {
				kind: 'completed',
				conversationId: run.conversationId,
				model: run.model
			});
			if (settlement.kind === 'lost') return settlement;

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

			return this.deps.settlements.complete(settlement);
		});
		if (settled.kind === 'settled') this.deps.eventBus.notify(run.id);
		return settled.kind === 'settled';
	}
}
