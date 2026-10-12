import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import type { AgentRunId, ConversationId, ToolActivity } from '$lib/models/agent';
import type { ProjectId } from '$lib/models/projects';
import { AgentRunEventRecords } from '$lib/server/repositories/agent/postgres/agent-runs';
import { AgentRunRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { ToolContextLogRecords } from '$lib/server/repositories/context-usage/postgres/tool-context-log';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { context, now, seedUser } from '../database-harness';

const ATTACHMENT = '30000000-0000-4000-8000-000000000001';
const NOTE = '30000000-0000-4000-8000-000000000002';
const SKILL = '30000000-0000-4000-8000-000000000003';
const ELSEWHERE = '20000000-0000-4000-8000-0000000000ee' as ProjectId;

/** A call as the archive writes it: arguments when it starts, the result when it settles. */
const settled = (
	callId: string,
	name: 'search' | 'sed' | 'load_skill',
	input: ToolActivity['input'],
	output: Extract<ToolActivity, { status: 'succeeded' }>['output']
): ToolActivity[] => [
	{ callId, name, input, status: 'running' },
	{ callId, name, input: {}, status: 'succeeded', output }
];

/**
 * A chat for `suffix`'s user, every call journalled through the production archive within one
 * run. The run's events take their cursors in call order, as a live run's would. The archive
 * writes the calls in `writeOrder` (call order unless given), so a test can make the write
 * order and the cursor order disagree.
 */
const journal = async (
	suffix: string,
	calls: (project: ProjectId) => ToolActivity[][],
	writeOrder?: readonly number[]
) => {
	const owner = await seedUser(suffix);
	const project = await new ProjectRecords(owner, context.db).insert({
		name: `Context usage ${suffix}`
	});
	const records = new ConversationRecords(owner, context.db);
	const conversation = await records.insert({
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		contextProjectId: project.id,
		title: 'Liability questions',
		createdAt: now,
		updatedAt: now
	});
	const run = await new AgentRunRecords(owner, context.db).insert({
		kind: 'agent',
		id: crypto.randomUUID() as AgentRunId,
		userId: owner.userId,
		conversationId: conversation.id,
		model: 'openai/test-model',
		executionMode: 'approval_required',
		status: 'running',
		requestId: `context-usage-${suffix}`,
		pendingDecisions: [],
		inputSnapshot: { conversationId: conversation.id, prompt: 'Context usage contract' },
		contextSnapshot: { contextNotes: [], contextResources: [], skills: { items: [] } },
		createdAt: now,
		updatedAt: now
	});
	const events = new AgentRunEventRecords(owner, context.db);
	const journalled = calls(project.id);
	const cursors: string[][] = [];
	for (const rows of journalled) {
		const callCursors: string[] = [];
		for (const row of rows)
			callCursors.push(
				(await events.append(run.id, 1, { type: 'text_delta', text: row.name })).cursor
			);
		cursors.push(callCursors);
	}
	// Every row shares the fixed test clock, so only the cursor tells the calls apart.
	const archive = new ConversationArchive(owner, records, testClock);
	for (const index of writeOrder ?? journalled.keys())
		for (const [position, row] of journalled[index]!.entries())
			await archive.recordToolActivity(conversation.id, row, {
				runId: run.id,
				eventCursor: cursors[index]![position]!
			});
	return { owner, project: project.id, conversation: conversation.id };
};

describe('The tool context log reads what the conversation archive journals', () => {
	it('attributes hits to their own project, keeps empty searches, and counts what it cannot read', async () => {
		const mine = await journal('c1', (project) => [
			settled('hit', 'search', { query: 'liability cap' }, [
				// Two passages of one file are one look at it.
				{
					source: { kind: 'attachment', id: ATTACHMENT, projectId: project },
					content: 'a',
					score: 0.9
				},
				{
					source: { kind: 'attachment', id: ATTACHMENT, projectId: project },
					content: 'b',
					score: 0.8
				},
				{ source: { kind: 'note', id: NOTE, projectId: ELSEWHERE }, content: 'c', score: 0.7 }
			]),
			settled('miss', 'search', { query: 'termination clause', projectId: project }, []),
			settled(
				'read',
				'sed',
				{ path: `/projects/${project}/attachments/${ATTACHMENT}.txt` },
				{ kind: 'content', path: `/projects/${project}/attachments/${ATTACHMENT}.txt` }
			),
			settled('skill', 'load_skill', { noteId: SKILL }, { noteId: SKILL, name: 'Contract review' }),
			settled('odd', 'sed', { path: '/x' }, { kind: 'something-new' }),
			[
				{ callId: 'failed', name: 'search', input: { query: 'x' }, status: 'running' },
				{ callId: 'failed', name: 'search', input: {}, status: 'failed', failure: 'boom' }
			]
		]);
		// Another user's journal is not this actor's context.
		await journal('c2', () => [settled('theirs', 'search', { query: 'theirs' }, [])]);

		const log = await new ToolContextLogRecords(mine.owner, context.db).read();

		expect({
			touches: log.touches.map((touch) =>
				touch.kind === 'skill'
					? { kind: touch.kind, id: touch.id, title: touch.title }
					: { kind: touch.kind, id: touch.id, projectId: touch.projectId }
			),
			emptySearches: log.emptySearches.map(({ query, projectId }) => ({ query, projectId })),
			conversations: log.conversations,
			unreadableCalls: log.unreadableCalls
		}).toEqual({
			touches: [
				{ kind: 'attachment', id: ATTACHMENT, projectId: mine.project },
				{ kind: 'note', id: NOTE, projectId: ELSEWHERE },
				{ kind: 'attachment', id: ATTACHMENT, projectId: mine.project },
				{ kind: 'skill', id: SKILL, title: 'Contract review' }
			],
			emptySearches: [{ query: 'termination clause', projectId: mine.project }],
			conversations: [
				{ id: mine.conversation, title: 'Liability questions', projectId: mine.project }
			],
			unreadableCalls: 1
		});
	});

	it('settles a call whose rows are read in the opposite order', async () => {
		const reversed = await journal('c3', (project): ToolActivity[][] => [
			[
				{ callId: 'late', name: 'search', input: {}, status: 'succeeded', output: [] },
				{
					callId: 'late',
					name: 'search',
					input: { query: 'pricing tiers', projectId: project },
					status: 'running'
				}
			]
		]);

		const log = await new ToolContextLogRecords(reversed.owner, context.db).read();

		expect(log.emptySearches.map(({ query }) => query)).toEqual(['pricing tiers']);
	});

	it('orders two calls of one millisecond by their event cursors, not by when they were written', async () => {
		const ordered = await journal(
			'c4',
			(project) => [
				settled(
					'first',
					'sed',
					{ path: `/projects/${project}/notes/${NOTE}.md` },
					{ kind: 'content', path: `/projects/${project}/notes/${NOTE}.md` }
				),
				settled(
					'second',
					'sed',
					{ path: `/projects/${project}/attachments/${ATTACHMENT}.txt` },
					{ kind: 'content', path: `/projects/${project}/attachments/${ATTACHMENT}.txt` }
				)
			],
			[1, 0]
		);

		const log = await new ToolContextLogRecords(ordered.owner, context.db).read();

		expect(
			[...log.touches].sort((x, y) => x.call - y.call).map((touch) => [touch.kind, touch.id])
		).toEqual([
			['note', NOTE],
			['attachment', ATTACHMENT]
		]);
	});
});
