import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import {
	AgentRunBacklogRecords,
	AgentRunRecords
} from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { RunTransitions } from '$lib/server/services/agent/runs/transitions';
import { context, now, seedUser } from '../database-harness';

const queuedChat = async (owner: Awaited<ReturnType<typeof seedUser>>) => {
	const conversation = await new ConversationRecords(owner, context.db).insert({
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	return new AgentRunRecords(owner, context.db).insert({
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'test/model',
		executionMode: 'approval_required',
		status: 'queued',
		requestId: crypto.randomUUID(),
		pendingDecisions: [],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Scheduled request' },
		createdAt: now,
		updatedAt: now
	});
};

const interruptedFor = async (
	executor: 'web' | 'worker',
	owner: Awaited<ReturnType<typeof seedUser>>
) =>
	(await new AgentRunBacklogRecords(context.db).listInterrupted(executor))
		.filter((run) => run.userId === owner.userId)
		.map((run) => run.id);

describe('recovery of interrupted runs by the process that executed them', () => {
	it('lists a running run only for the kind of process that claimed it', async () => {
		const owner = await seedUser('18801');
		const runs = new AgentRunRecords(owner, context.db);
		const inWorker = await queuedChat(owner);
		const inWeb = await queuedChat(owner);

		await new RunTransitions(runs, 'worker').claim(inWorker.id, now);
		await new RunTransitions(runs, 'web').claim(inWeb.id, now);

		expect({
			web: await interruptedFor('web', owner),
			worker: await interruptedFor('worker', owner)
		}).toEqual({ web: [inWeb.id], worker: [inWorker.id] });
	});

	it('hands a run to the web process when the web process claims it again', async () => {
		const owner = await seedUser('18802');
		const runs = new AgentRunRecords(owner, context.db);
		const run = await queuedChat(owner);
		await new RunTransitions(runs, 'worker').claim(run.id, now);
		// An approval puts a parked run back in the queue; the web process then claims it.
		await context.client`update agent_runs set status = 'queued' where id = ${run.id}`;

		await new RunTransitions(runs, 'web').claim(run.id, now);

		expect({
			web: await interruptedFor('web', owner),
			worker: await interruptedFor('worker', owner)
		}).toEqual({ web: [run.id], worker: [] });
	});

	it('counts a run from before the worker ran the agent as the web process’s', async () => {
		const owner = await seedUser('18803');
		const run = await queuedChat(owner);
		// The row as an earlier release wrote it: running, with no claim that named a process.
		await context.client`
			update agent_runs set status = 'running', started_at = now() where id = ${run.id}`;

		expect({
			web: await interruptedFor('web', owner),
			worker: await interruptedFor('worker', owner)
		}).toEqual({ web: [run.id], worker: [] });
	});
});
