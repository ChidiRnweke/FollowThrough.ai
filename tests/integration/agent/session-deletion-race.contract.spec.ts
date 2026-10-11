import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import {
	AgentRunRecords,
	AgentSessionRecords
} from '$lib/server/repositories/agent/postgres/agent-settings';
import {
	AgentRunDecisionRecords,
	AgentRunEventRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import * as schema from '$lib/server/db/schema';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote, now } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner } = await seedNote(suffix);
	const tx = createTransactionContext(context.db);
	const conversations = new ConversationRecords(owner, tx.database);
	const journal = new ConversationArchive(owner, conversations, testClock);
	const runs = new AgentRunRecords(owner, tx.database);
	const conversation = await conversations.insert({
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	const controller = new AgentSdkHarness(
		owner,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			now: testClock,
			...agentRulesFixture(),
			conversationMessages: journal,
			conversationSessions: journal,
			records: new AgentRunHarnessRecords(
				runs,
				new AgentRunEventRecords(owner, tx.database),
				new AgentRunDecisionRecords(owner, tx.database),
				new AgentSessionRecords(owner, tx.database)
			),
			transactionRunner: tx.transactionRunner
		})
	);
	const [backend] = await context.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
	return { owner, tx, conversations, journal, runs, conversation, controller, pid: backend!.pid };
};
const waitForLock = async (connection: ReturnType<typeof postgres>, pid: number) => {
	await vi.waitFor(async () => {
		const [row] = await connection<
			{ wait_event_type: string | null }[]
		>`select wait_event_type from pg_stat_activity where pid = ${pid}`;
		if (row?.wait_event_type !== 'Lock')
			throw new Error('Operation has not reached the conversation lock');
	});
};

it('preserves a newly submitted run when deletion waits for submission to commit', async () => {
	const { owner, conversation, controller, conversations, runs, pid } = await setup('32831');
	const competing = postgres(context.url, { max: 2 });
	const submission = createTransactionContext(drizzle(competing, { schema }));
	const locked = Promise.withResolvers<AgentRunId>();
	const release = Promise.withResolvers<void>();
	const submitted = submission.transactionRunner.run(async () => {
		const journal = new ConversationArchive(
			owner,
			new ConversationRecords(owner, submission.database),
			testClock
		);
		await journal.getOrCreate({
			conversationId: conversation.id,
			prompt: 'Keep this request'
		});
		const run = await new AgentRunRecords(owner, submission.database).insert({
			kind: 'agent',
			id: crypto.randomUUID() as AgentRunId,
			userId: owner.userId,
			conversationId: conversation.id,
			model: 'test/model',
			executionMode: 'approval_required',
			status: 'queued',
			requestId: crypto.randomUUID(),
			pendingDecisions: [],
			inputSnapshot: { conversationId: conversation.id, prompt: 'Keep this request' },
			createdAt: now,
			updatedAt: now
		});
		await journal.recordUserPrompt(conversation.id, 'Keep this request', run.id);
		await new AgentRunEventRecords(owner, submission.database).append(run.id, 1, {
			type: 'run_queued',
			runId: run.id,
			attempt: 1,
			reason: 'submitted'
		});
		locked.resolve(run.id);
		await release.promise;
	});
	try {
		const id = await locked.promise;
		const deletion = controller.deleteSession(conversation.id).then(
			() => 'deleted',
			(error: Error) => error.message
		);
		await waitForLock(competing, pid);
		release.resolve();
		await submitted;
		expect({
			deletion: await deletion,
			conversation: (await conversations.findById(conversation.id))?.id,
			run: (await runs.findById(id))?.status
		}).toEqual({
			deletion: 'Stop or resolve the active agent run before deleting this chat',
			conversation: conversation.id,
			run: 'queued'
		});
	} finally {
		release.resolve();
		await submitted;
		await competing.end();
	}
});

it('rejects submission to a conversation whose deletion commits first', async () => {
	const { owner, conversation, tx, journal, conversations, pid } = await setup('32832');
	const competing = postgres(context.url, { max: 2 });
	const deletionTx = createTransactionContext(drizzle(competing, { schema }));
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const deleted = deletionTx.transactionRunner.run(async () => {
		const records = new ConversationRecords(owner, deletionTx.database);
		await records.findForWrite(conversation.id);
		await records.delete(conversation.id);
		locked.resolve();
		await release.promise;
	});
	try {
		await locked.promise;
		const submission = tx.transactionRunner
			.run(() => journal.getOrCreate({ conversationId: conversation.id, prompt: 'Too late' }))
			.then(
				() => 'submitted',
				(error: Error) => error.message
			);
		await waitForLock(competing, pid);
		release.resolve();
		await deleted;
		expect({
			submission: await submission,
			conversation: await conversations.findById(conversation.id)
		}).toEqual({ submission: 'Conversation was not found', conversation: undefined });
	} finally {
		release.resolve();
		await deleted;
		await competing.end();
	}
});
