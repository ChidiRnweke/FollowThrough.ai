import { RunPreparation } from '$lib/server/services/agent/runs/preparation';
import { expect, it } from 'vitest';
import type { AgentRunId, ConversationId } from '$lib/models/agent';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { AgentRunEventRecords } from '$lib/server/repositories/agent/postgres/agent-runs';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { NoteActionRequests } from '$lib/server/services/agent/runs/note-action-requests';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { context, seedNote, now } from '../database-harness';

it('selects queued chat runs without selecting running chats or queued note actions', async () => {
	const { owner, note } = await seedNote('12601');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const runs = new AgentRunRecords(database);
	const events = new AgentRunEventRecords(database);
	const conversations = new ConversationRecords(database);
	const journal = new ConversationArchive(conversations);
	const queuedChat = async () =>
		transactionRunner.run(async () => {
			const conversation = await conversations.insert(owner, {
				id: crypto.randomUUID() as ConversationId,
				userId: owner.userId,
				kind: 'chat',
				createdAt: now,
				updatedAt: now
			});
			const run = await runs.insert(owner, {
				kind: 'agent',
				id: crypto.randomUUID() as AgentRunId,
				userId: owner.userId,
				conversationId: conversation.id,
				model: 'test/model',
				executionMode: 'approval_required',
				status: 'queued',
				requestId: crypto.randomUUID(),
				pendingDecisions: [],
				inputSnapshot: { conversationId: conversation.id, prompt: 'Queued request' },
				createdAt: now,
				updatedAt: now
			});
			await journal.recordUserPrompt(owner, conversation.id, 'Queued request', run.id);
			await events.append(run.id, 1, {
				type: 'run_queued',
				runId: run.id,
				attempt: 1,
				reason: 'submitted'
			});
			return run;
		});
	try {
		const queued = await queuedChat();
		const running = await queuedChat();
		await new RunPreparation(runs).claim(running.id, now);
		await transactionRunner.run(() =>
			new NoteActionRequests(runs, events, conversations).prepare(owner, {
				requestId: crypto.randomUUID(),
				context: {
					kind: 'promise_extraction',
					generation: { kind: 'rules' },
					selection: {
						noteId: note.id,
						revision: note.currentRevision,
						from: 0,
						to: note.plainText.length,
						text: note.plainText
					}
				}
			})
		);
		expect(
			(await runs.listQueuedAgents())
				.filter((run) => run.userId === owner.userId)
				.map((run) => run.id)
		).toEqual([queued.id]);
	} finally {
		await context.client`delete from agent_runs where user_id = ${owner.userId}`;
	}
});
