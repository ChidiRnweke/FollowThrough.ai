import type {
	ActorContext,
	AgentEvent,
	AgentRun,
	AgentRunDecisionRecord,
	AgentRunEventRecord,
	AgentRunId,
	AgentRunStatus,
	ConversationId,
	DateTime
} from '$lib/models';
import { assertAgentRunTransition } from '$lib/models';
import { ConflictError, NotFoundError, ValidationError } from '$lib/errors';
import type {
	AgentRunDecisionRepository,
	AgentRunEventRepository,
	AgentRunRepository
} from '$lib/server/repositories';
import type { SnapshotParticipant } from './in-memory-transaction';

export class InMemoryAgentRunPersistence
	implements
		AgentRunRepository,
		AgentRunEventRepository,
		AgentRunDecisionRepository,
		SnapshotParticipant
{
	runs: AgentRun[] = [];
	events: AgentRunEventRecord[] = [];
	decisions: AgentRunDecisionRecord[] = [];
	private cursor = 0n;

	async findById(actor: ActorContext, id: AgentRunId): Promise<AgentRun | undefined> {
		return this.runs.find((run) => run.id === id && run.userId === actor.userId);
	}

	async findByRequestId(actor: ActorContext, requestId: string): Promise<AgentRun | undefined> {
		return this.runs.find((run) => run.userId === actor.userId && run.requestId === requestId);
	}

	async findAwaitingByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined> {
		return this.runs.find(
			(run) =>
				run.userId === actor.userId &&
				run.conversationId === conversationId &&
				run.status === 'awaiting_approval'
		);
	}

	async findLatestByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined> {
		return this.runs
			.filter((run) => run.userId === actor.userId && run.conversationId === conversationId)
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
	}

	async findActiveByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentRun | undefined> {
		return this.runs.find(
			(run) =>
				run.userId === actor.userId &&
				run.conversationId === conversationId &&
				['queued', 'running', 'awaiting_approval', 'cancelling'].includes(run.status)
		);
	}

	async insert(actor: ActorContext, run: AgentRun): Promise<AgentRun> {
		const inserted = await this.insertIdempotent(actor, run);
		if (!inserted) throw new ConflictError('Agent request already exists');
		return inserted;
	}

	async insertIdempotent(actor: ActorContext, run: AgentRun): Promise<AgentRun | undefined> {
		if (await this.findByRequestId(actor, run.requestId)) return undefined;
		if (
			this.runs.some(
				(item) =>
					item.conversationId === run.conversationId &&
					['queued', 'running', 'awaiting_approval', 'cancelling'].includes(item.status)
			)
		)
			throw new ValidationError('This conversation already has an active agent run');
		const owned = { ...run, userId: actor.userId };
		this.runs.push(owned);
		return owned;
	}

	async update(actor: ActorContext, run: AgentRun): Promise<AgentRun> {
		const current = await this.findById(actor, run.id);
		if (!current) throw new NotFoundError('Agent run was not found');
		if (current.status !== run.status) assertAgentRunTransition(current.status, run.status);
		this.replace(run);
		return run;
	}

	async transition(
		runId: AgentRunId,
		from: AgentRunStatus | readonly AgentRunStatus[],
		to: AgentRunStatus,
		patch: Partial<AgentRun> = {}
	): Promise<AgentRun | undefined> {
		const fromStatuses = Array.isArray(from) ? from : [from];
		const run = this.runs.find(
			(r) => r.id === runId && (fromStatuses as string[]).includes(r.status)
		);
		if (!run) return undefined;
		assertAgentRunTransition(run.status, to);
		const updated = {
			...run,
			...patch,
			status: to,
			updatedAt: new Date().toISOString() as DateTime
		} as AgentRun;
		this.replace(updated);
		return updated;
	}

	async requestCancellation(
		actor: ActorContext,
		runId: AgentRunId,
		at: DateTime
	): Promise<AgentRun> {
		const run = await this.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		if (['completed', 'failed', 'cancelled', 'cancelling'].includes(run.status)) return run;
		const updated: AgentRun = {
			...run,
			status: run.status === 'queued' ? 'cancelled' : 'cancelling',
			cancelRequestedAt: at,
			...(run.status === 'queued' ? { finishedAt: at } : {}),
			updatedAt: at
		};
		this.replace(updated);
		return updated;
	}

	async requeueAfterDecision(
		actor: ActorContext,
		runId: AgentRunId,
		at: DateTime
	): Promise<AgentRun> {
		const run = await this.findById(actor, runId);
		if (!run) throw new NotFoundError('Agent run was not found');
		if (run.status === 'queued') return run;
		const updated: AgentRun = { ...run, status: 'queued', updatedAt: at };
		this.replace(updated);
		return updated;
	}

	async recoverInterrupted(failureMessage: string): Promise<number> {
		let count = 0;
		this.runs = this.runs.map((run) => {
			if (run.status === 'running' || run.status === 'cancelling') {
				count++;
				return {
					...run,
					status: 'failed' as const,
					failure: failureMessage,
					finishedAt: new Date().toISOString() as DateTime
				};
			}
			return run;
		});
		return count;
	}

	async append(
		runId: AgentRunId,
		attempt: number,
		event: AgentEvent
	): Promise<AgentRunEventRecord> {
		this.cursor += 1n;
		const record = { cursor: this.cursor.toString(), runId, attempt, event, createdAt: new Date() };
		this.events.push(record);
		return record;
	}

	async replay(
		actor: ActorContext,
		runId: AgentRunId,
		after: string
	): Promise<readonly AgentRunEventRecord[]> {
		return this.events.filter(
			(event) => event.runId === runId && BigInt(event.cursor) > BigInt(after)
		);
	}

	async latestCursor(actor: ActorContext, runId: AgentRunId): Promise<string> {
		void actor;
		return this.events.filter((event) => event.runId === runId).at(-1)?.cursor ?? '0';
	}

	async reconstructText(runId: AgentRunId, attempt: number): Promise<string> {
		return this.events
			.filter((record) => record.runId === runId && record.attempt === attempt)
			.map((record) => record.event)
			.filter((event): event is Extract<AgentEvent, { type: 'text_delta' }> =>
				Boolean(event.type === 'text_delta')
			)
			.map((event) => event.text)
			.join('');
	}

	async record(
		actor: ActorContext,
		input: { runId: AgentRunId; callId: string; decision: 'approve' | 'reject'; message?: string }
	): Promise<AgentRunDecisionRecord> {
		const existing = this.decisions.find(
			(item) => item.runId === input.runId && item.callId === input.callId
		);
		if (existing) {
			if (existing.decision !== input.decision || existing.message !== input.message)
				throw new ConflictError('A different decision already exists');
			return existing;
		}
		const record: AgentRunDecisionRecord = { ...input, createdAt: new Date() };
		this.decisions.push(record);
		return record;
	}

	async loadUnconsumed(runId: AgentRunId): Promise<AgentRunDecisionRecord | undefined> {
		return this.decisions.find((item) => item.runId === runId && !item.consumedAt);
	}

	async consume(runId: AgentRunId, callId: string, at: Date): Promise<boolean> {
		const index = this.decisions.findIndex(
			(item) => item.runId === runId && item.callId === callId && !item.consumedAt
		);
		if (index < 0) return false;
		this.decisions[index] = { ...this.decisions[index]!, consumedAt: at };
		return true;
	}

	async clearPending(runId: AgentRunId): Promise<boolean> {
		const run = this.runs.find((r) => r.id === runId);
		if (!run) return false;
		this.replace({ ...run, pendingDecisions: [] });
		return true;
	}

	snapshot(): unknown {
		return structuredClone({
			runs: this.runs,
			events: this.events,
			decisions: this.decisions,
			cursor: this.cursor
		});
	}

	restore(snapshot: unknown): void {
		const state = snapshot as ReturnType<InMemoryAgentRunPersistence['state']>;
		this.runs = state.runs;
		this.events = state.events;
		this.decisions = state.decisions;
		this.cursor = state.cursor;
	}

	private state() {
		return {
			runs: this.runs,
			events: this.events,
			decisions: this.decisions,
			cursor: this.cursor
		};
	}

	private replace(run: AgentRun): void {
		this.runs = this.runs.map((item) => (item.id === run.id ? run : item));
	}
}
