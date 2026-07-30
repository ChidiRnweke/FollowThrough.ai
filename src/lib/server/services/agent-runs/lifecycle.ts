import type {
	ActorContext,
	AgentExecutionUpdate,
	AgentEvent,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunEventRecord,
	AgentRunId,
	DateTime,
	Provenance,
	ProvenanceId,
	RunAgentInput,
	ToolActivity
} from '$lib/models';
import type {
	AgentRunDecisionRepository,
	AgentRunEventRepository,
	AgentRunRepository
} from '$lib/server/repositories';
import type { AgentSessionRepository, TransactionRunner } from '$lib/server/repositories';
interface AgentContextBuilder {
	build(
		actor: ActorContext,
		input: RunAgentInput,
		run: {
			provenanceId: ProvenanceId;
			conversationId?: import('$lib/models').ConversationId;
		}
	): Promise<Readonly<Record<string, unknown>>>;
}
interface AgentToolExecutor {
	execute(
		input: {
			readonly callId: string;
			readonly toolName: string;
			readonly arguments: Readonly<Record<string, unknown>>;
			readonly classification: 'read' | 'proposal' | 'mutation';
		},
		action: () => Promise<unknown>
	): Promise<unknown>;
}
interface AgentRunner {
	execute(input: {
		readonly actor: ActorContext;
		readonly run: AgentRun;
		readonly request: RunAgentInput;
		readonly context: Readonly<Record<string, unknown>>;
		readonly decision?: AgentRunDecisionRecord;
		readonly signal: AbortSignal;
		readonly toolExecutor: AgentToolExecutor;
	}): AsyncIterable<AgentExecutionUpdate>;
}
interface ProvenanceRecorder {
	record(
		actor: ActorContext,
		input: Omit<Provenance, 'id' | 'userId' | 'createdAt'>
	): Promise<Provenance>;
}
interface ConversationJournal {
	recordToolActivity(
		actor: ActorContext,
		conversationId: import('$lib/models').ConversationId,
		activity: ToolActivity,
		provenance?: { readonly runId: AgentRunId; readonly eventCursor?: string }
	): Promise<void>;
	recordAssistantText(
		actor: ActorContext,
		conversationId: import('$lib/models').ConversationId,
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
		const run = await this.prepare(runId);
		if (!run) return 'cancelled';
		const actor: ActorContext = { userId: run.userId };
		const request = run.inputSnapshot as unknown as RunAgentInput;
		const decision = await this.deps.decisions.loadUnconsumed(run.id);
		const successfulMutations = new Map<string, string>();
		const toolExecutor: AgentToolExecutor = {
			execute: async (input, action) => {
				const output = await action();
				if (input.classification === 'mutation')
					successfulMutations.set(input.callId, input.toolName);
				return output;
			}
		};
		let lastEvent: AgentRunEventRecord | undefined;
		try {
			for await (const update of this.deps.runner.execute({
				actor,
				run,
				request,
				context: run.contextSnapshot ?? {},
				...(decision ? { decision } : {}),
				signal,
				toolExecutor
			})) {
				if (update.type === 'event') {
					lastEvent = await this.persistEvent(run, actor, update.event);
					if (update.event.type === 'tool_completed' && !update.event.failure) {
						const resource = successfulMutations.get(update.event.callId);
						if (resource) {
							successfulMutations.delete(update.event.callId);
							lastEvent = await this.persistEvent(run, actor, {
								type: 'resources_stale',
								resources: [resource]
							});
						}
					}
					continue;
				}
				if (update.type === 'approval_checkpoint') {
					await this.deps.transactions.run(async () => {
						await this.deps.sessions.replace(run.conversationId, update.sessionItems);
						if (decision) await this.deps.decisions.consume(run.id, decision.callId, new Date());
						await this.deps.runs.transition(run.id, 'running', 'awaiting_approval', {
							serializedState: update.serializedState,
							pendingDecisions: update.pendingDecisions,
							updatedAt: new Date().toISOString() as DateTime
						});
					});
					// Every other durable transition notifies; without this one a
					// subscriber waiting on the run reaching a terminal status never
					// learns it parked, because the preceding `approval_required`
					// event fires while the run is still `running`.
					this.deps.eventBus.notify(run.id);
					return 'awaiting_approval';
				}
				await this.complete(run, actor, update.sessionItems, lastEvent?.cursor, decision?.callId);
				return 'completed';
			}
			throw new Error('The agent provider ended without a durable outcome');
		} catch (error) {
			if (signal.aborted) {
				await this.finishCancellation(run);
				return 'cancelled';
			}
			throw error;
		}
	}

	async finishCancellation(run: AgentRun): Promise<void> {
		await this.deps.transactions.run(async () => {
			await this.deps.decisions.clearPending(run.id);
			await this.deps.events.append(run.id, 1, {
				type: 'cancelled',
				runId: run.id,
				message: 'Generation stopped'
			});
			await this.deps.runs.transition(run.id, ['running', 'cancelling'], 'cancelled', {
				pendingDecisions: [],
				finishedAt: new Date().toISOString() as DateTime,
				failure: 'The request was cancelled'
			});
		});
		this.deps.eventBus.notify(run.id);
	}

	private async prepare(runId: AgentRunId): Promise<AgentRun | undefined> {
		const transitioned = await this.deps.runs.transition(runId, 'queued', 'running', {
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

		if (!run.contextSnapshot || Object.keys(run.contextSnapshot).length === 0) {
			const context = await this.deps.contextBuilder.build(
				actor,
				run.inputSnapshot as unknown as RunAgentInput,
				{ provenanceId: run.provenanceId!, conversationId: run.conversationId }
			);
			run = { ...run, contextSnapshot: context };
			await this.deps.runs.update(actor, run);
		}

		await this.deps.events.append(run.id, 1, {
			type: 'run_started',
			runId: run.id,
			attempt: 1
		});
		this.deps.eventBus.notify(run.id);

		return run;
	}

	private async persistEvent(
		run: AgentRun,
		actor: ActorContext,
		event: AgentEvent
	): Promise<AgentRunEventRecord> {
		const record = await this.deps.transactions.run(async () => {
			const record = await this.deps.events.append(run.id, 1, event);
			const activity = this.toolActivity(event);
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
		sessionItems: readonly Readonly<Record<string, unknown>>[],
		eventCursor?: string,
		decisionCallId?: string
	): Promise<void> {
		await this.deps.transactions.run(async () => {
			await this.deps.sessions.replace(run.conversationId, sessionItems);
			if (decisionCallId) await this.deps.decisions.consume(run.id, decisionCallId, new Date());
			const text = await this.deps.events.reconstructText(run.id, 1);
			await this.deps.conversations.recordAssistantText(
				actor,
				run.conversationId,
				text,
				run.model,
				{ runId: run.id, ...(eventCursor ? { eventCursor } : {}) }
			);
			await this.deps.runs.transition(run.id, 'running', 'completed', {
				serializedState: undefined,
				pendingDecisions: [],
				finishedAt: new Date().toISOString() as DateTime
			});
		});
		this.deps.eventBus.notify(run.id);
	}

	private toolActivity(event: AgentEvent): ToolActivity | undefined {
		if (event.type === 'tool_started')
			return {
				callId: event.callId,
				name: event.name,
				input: event.arguments,
				status: 'running'
			};
		if (event.type === 'tool_completed')
			return {
				callId: event.callId,
				name: event.name,
				input: {},
				...(event.output === undefined ? {} : { output: event.output }),
				...(event.failure ? { failure: event.failure } : {}),
				status: event.failure ? 'failed' : 'succeeded'
			};
		if (event.type === 'approval_required')
			return {
				callId: event.callId,
				name: event.name,
				input: event.arguments,
				status: 'approval_required'
			};
		return undefined;
	}
}
