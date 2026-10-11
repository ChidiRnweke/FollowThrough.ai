import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { AgentRunNotificationRecords } from '$lib/server/repositories/agent/postgres/run-notifications';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { actor, context, now, notifications, seedProvenance } from '../database-harness';

const seedRun = async (suffix: string) => {
	const owner = actor(suffix);
	await new UserRecords(context.db).ensureLocal(owner);
	const conversation = await new ConversationRecords(context.db).insert(owner, {
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	const provenance = await seedProvenance(owner, suffix);
	return new AgentRunRecords(context.db).insert(owner, {
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'openai/test-model',
		executionMode: 'approval_required',
		status: 'queued',
		requestId: `notification-contract-${suffix}`,
		pendingDecisions: [],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Notify listeners' },
		contextSnapshot: { contextNotes: [], contextResources: [], skills: { items: [] } },
		provenanceId: provenance.id,
		createdAt: now,
		updatedAt: now
	});
};

it('wakes a run listener on another connection only once the change commits', async () => {
	const [run, other] = [await seedRun('18101'), await seedRun('18102')];
	const writer = postgres(context.url, { max: 1 });
	const received: string[] = [];
	const stop = await new AgentRunNotificationRecords(notifications).listen(run.id, () =>
		received.push('changed')
	);
	try {
		const committed = Promise.withResolvers<void>();
		const transaction = writer.begin(async (sql) => {
			await sql`insert into agent_run_events (run_id, attempt, event)
				values (${run.id}, 1, ${sql.json({ type: 'run_started', runId: run.id, attempt: 1 })})`;
			await sql`update agent_runs set status = 'cancelled' where id = ${other.id}`;
			await committed.promise;
		});
		await new Promise((resolve) => setTimeout(resolve, 200));
		const beforeCommit = received.length;
		committed.resolve();
		await transaction;
		await vi.waitFor(() => {
			if (!received.length) throw new Error('No notification after commit');
		});
		expect({ beforeCommit, afterCommit: received }).toEqual({
			beforeCommit: 0,
			afterCommit: ['changed']
		});
	} finally {
		await stop();
		await writer.end();
	}
});
