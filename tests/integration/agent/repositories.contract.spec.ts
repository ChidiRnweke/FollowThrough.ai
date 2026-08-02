import { describe, expect, it } from 'vitest';
import type {
	Conversation,
	ConversationId,
	AgentRun,
	AgentRunId,
	Message,
	MessageId
} from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import {
	AgentPreferenceRecords,
	AgentRunRecords
} from '$lib/server/repositories/agent/postgres/agent-settings';
import {
	AgentRunDecisionRecords,
	AgentRunEventRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import { TrustPolicyRecords } from '$lib/server/repositories/agent/postgres/trust-policies';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { actor, context, now, seedNote } from '../database-harness';
describe('Postgres conversation repository invariants', () => {
	it('returns messages in chronological order', async () => {
		const owner = actor('7');
		await new UserRecords(context.db).ensureLocal(owner);
		const repository = new ConversationRecords(context.db);
		const conversation: Conversation = {
			id: '20000000-0000-4000-8000-000000000007' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			title: 'Ordering',
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, conversation);
		for (const [index, text] of ['first', 'second'].entries()) {
			const message: Message = {
				id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as MessageId,
				conversationId: conversation.id,
				role: 'user',
				content: { text },
				createdAt: new Date(Date.parse(now) + index * 1000).toISOString() as DateTime
			};
			await repository.appendMessage(owner, message);
		}
		const messages = await repository.listMessages(owner, conversation.id);
		expect(messages.map((message) => message.content.text)).toEqual(['first', 'second']);
	});
	it('does not reveal a conversation to another actor', async () => {
		const owner = actor('8');
		await new UserRecords(context.db).ensureLocal(owner);
		const repository = new ConversationRecords(context.db);
		const conversation: Conversation = {
			id: '20000000-0000-4000-8000-000000000008' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, conversation);
		expect(await repository.findById(actor('9'), conversation.id)).toBeUndefined();
	});
	it('lists only sessions owned by the actor', async () => {
		const owner = actor('14');
		const other = actor('15');
		const users = new UserRecords(context.db);
		await users.ensureLocal(owner);
		await users.ensureLocal(other);
		const repository = new ConversationRecords(context.db);
		await repository.insert(owner, {
			id: '20000000-0000-4000-8000-000000000014' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			title: 'Owned session',
			createdAt: now,
			updatedAt: now
		});
		await repository.insert(other, {
			id: '20000000-0000-4000-8000-000000000015' as ConversationId,
			userId: other.userId,
			kind: 'chat',
			title: 'Foreign session',
			createdAt: now,
			updatedAt: now
		});
		const sessions = await repository.list(owner);
		expect(sessions.map((session) => session.title)).toEqual(['Owned session']);
	});
	it('deletes only the named messages of a rewound turn', async () => {
		const owner = actor('16');
		await new UserRecords(context.db).ensureLocal(owner);
		const repository = new ConversationRecords(context.db);
		const conversation: Conversation = {
			id: '20000000-0000-4000-8000-000000000016' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			title: 'Rewind',
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, conversation);
		// Same instant on purpose: the cut is by identity, not by timestamp.
		for (const [index, text] of ['keep', 'discard', 'discard too'].entries())
			await repository.appendMessage(owner, {
				id: `31000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as MessageId,
				conversationId: conversation.id,
				role: 'user',
				content: { text },
				createdAt: now
			});
		await repository.deleteMessages(owner, conversation.id, [
			'31000000-0000-4000-8000-000000000002' as MessageId,
			'31000000-0000-4000-8000-000000000003' as MessageId
		]);
		const messages = await repository.listMessages(owner, conversation.id);
		expect(messages.map((message) => message.content.text)).toEqual(['keep']);
	});
	it('persists conversation model and execution-mode overrides', async () => {
		const owner = actor('71');
		await new UserRecords(context.db).ensureLocal(owner);
		const repository = new ConversationRecords(context.db);
		const conversation = await repository.insert(owner, {
			id: '20000000-0000-4000-8000-000000000071' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			modelOverride: 'openai/gpt-test',
			executionModeOverride: 'auto_accept',
			createdAt: now,
			updatedAt: now
		});
		expect({
			model: conversation.modelOverride,
			mode: conversation.executionModeOverride
		}).toEqual({ model: 'openai/gpt-test', mode: 'auto_accept' });
	});
});
describe('Postgres agent settings repository invariants', () => {
	it('persists the actor default model and execution mode', async () => {
		const owner = actor('72');
		await new UserRecords(context.db).ensureLocal(owner);
		const repository = new AgentPreferenceRecords(context.db);
		const preferences = await repository.upsert(owner, {
			userId: owner.userId,
			defaultModel: 'anthropic/claude-test',
			executionMode: 'auto_accept',
			inlineSuggestionsEnabled: true,
			createdAt: now,
			updatedAt: now
		});
		expect({ model: preferences.defaultModel, mode: preferences.executionMode }).toEqual({
			model: 'anthropic/claude-test',
			mode: 'auto_accept'
		});
	});
	it('does not reveal a paused run to another actor', async () => {
		const owner = actor('73');
		await new UserRecords(context.db).ensureLocal(owner);
		const conversations = new ConversationRecords(context.db);
		const conversation = await conversations.insert(owner, {
			id: '20000000-0000-4000-8000-000000000073' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			createdAt: now,
			updatedAt: now
		});
		const repository = new AgentRunRecords(context.db);
		const run: AgentRun = {
			id: '70000000-0000-4000-8000-000000000073' as AgentRunId,
			userId: owner.userId,
			conversationId: conversation.id,
			model: 'openai/gpt-test',
			executionMode: 'approval_required',
			status: 'awaiting_approval',
			requestId: 'repository-contract-paused-1',
			serializedState: 'serialized-state',
			pendingDecisions: [
				{ callId: 'call-1', toolName: 'create_note', arguments: { title: 'Draft' } }
			],
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, run);
		expect(await repository.findById(actor('74'), run.id)).toBeUndefined();
	});
	it('round-trips serialized paused-run decisions', async () => {
		const owner = actor('75');
		await new UserRecords(context.db).ensureLocal(owner);
		const conversations = new ConversationRecords(context.db);
		const conversation = await conversations.insert(owner, {
			id: '20000000-0000-4000-8000-000000000075' as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			createdAt: now,
			updatedAt: now
		});
		const repository = new AgentRunRecords(context.db);
		const run = await repository.insert(owner, {
			id: '70000000-0000-4000-8000-000000000075' as AgentRunId,
			userId: owner.userId,
			conversationId: conversation.id,
			model: 'openai/gpt-test',
			executionMode: 'approval_required',
			status: 'awaiting_approval',
			requestId: 'repository-contract-paused-2',
			serializedState: 'serialized-state',
			pendingDecisions: [
				{ callId: 'call-2', toolName: 'archive_note', arguments: { noteId: 'note-1' } }
			],
			createdAt: now,
			updatedAt: now
		});
		expect({ state: run.serializedState, pending: run.pendingDecisions }).toEqual({
			state: 'serialized-state',
			pending: [{ callId: 'call-2', toolName: 'archive_note', arguments: { noteId: 'note-1' } }]
		});
	});
});
describe('Postgres durable agent run repository invariants', () => {
	const seedQueuedRun = async (suffix: string): Promise<AgentRun> => {
		const owner = actor(suffix);
		await new UserRecords(context.db).ensureLocal(owner);
		const conversation = await new ConversationRecords(context.db).insert(owner, {
			id: `21000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ConversationId,
			userId: owner.userId,
			kind: 'chat',
			createdAt: now,
			updatedAt: now
		});
		return new AgentRunRecords(context.db).insert(owner, {
			id: `71000000-0000-4000-8000-${suffix.padStart(12, '0')}` as AgentRunId,
			userId: owner.userId,
			conversationId: conversation.id,
			model: 'openai/gpt-test',
			executionMode: 'approval_required',
			status: 'queued',
			requestId: `request-${suffix}`,
			pendingDecisions: [],
			contextSnapshot: {},
			inputSnapshot: { prompt: 'Contract prompt' },
			createdAt: now,
			updatedAt: now
		});
	};
	it('orders replayed events by their global cursor', async () => {
		const run = await seedQueuedRun('93');
		const events = new AgentRunEventRecords(context.db);
		await Promise.all([
			events.append(run.id, 0, {
				type: 'run_queued',
				runId: run.id,
				attempt: 1,
				reason: 'submitted'
			}),
			events.append(run.id, 1, { type: 'text_delta', text: 'next' })
		]);
		const owner = actor('93');
		const replay = await events.replay(owner, run.id, '0');
		expect(replay.map((event) => event.cursor)).toEqual(
			[...replay.map((event) => event.cursor)].sort((left, right) => Number(left) - Number(right))
		);
	});
	it('returns the same durable decision for an identical retry', async () => {
		const run = await seedQueuedRun('94');
		const owner = actor('94');
		const decisions = new AgentRunDecisionRecords(context.db);
		const input = { runId: run.id, callId: 'call-94', decision: 'approve' as const };
		const first = await decisions.record(owner, input);
		const duplicate = await decisions.record(owner, input);
		expect(duplicate).toEqual(first);
	});
	it('rejects overlapping active runs in one conversation', async () => {
		const run = await seedQueuedRun('97');
		const repository = new AgentRunRecords(context.db);
		await expect(
			repository.insert(actor('97'), {
				...run,
				id: '71000000-0000-4000-8000-000000000197' as AgentRunId,
				requestId: 'request-97-overlap'
			})
		).rejects.toThrow();
	});
});
describe('Postgres trust-policy repository invariants', () => {
	it('lists only policies owned by the actor', async () => {
		const { owner } = await seedNote('25');
		const repository = new TrustPolicyRecords(context.db);
		await repository.upsert(owner, {
			userId: owner.userId,
			pipeline: 'agent',
			autoAcceptEnabled: false,
			conditions: {},
			createdAt: now,
			updatedAt: now
		});
		expect(await repository.list(actor('26'))).toEqual([]);
	});
});
