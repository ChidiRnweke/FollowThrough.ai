import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
import { initialSyncCursor } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { actor, context, seedNote } from '../database-harness';

describe('conditional normalized object reads', () => {
	it('fails loudly when a source record lacks its synchronization version', async () => {
		const { note, owner } = await seedNote('8710');
		await context.client`delete from workspace_sync_versions where resource_type = 'notes'
			and resource_id = jsonb_build_array(${note.id}::text)`;
		await expect(
			new WorkspaceSyncObjects(context.db).read(owner, { type: 'notes', id: [note.id] }, null)
		).rejects.toThrow(ZodError);
	});
	it('returns a normalized note and the version of that same database snapshot', async () => {
		const { note, owner } = await seedNote('8701');
		const identity = { type: 'notes' as const, id: [note.id] as [string] };
		const batch = await new WorkspaceSyncChanges(context.db).pull(owner, initialSyncCursor);
		const entry = batch.changes.find((entry) => entry.key === workspaceResourceKey(identity));
		if (entry?.kind !== 'upsert') throw new Error('Seeded note is missing from the journal');
		expect(await new WorkspaceSyncObjects(context.db).read(owner, identity, null)).toEqual({
			kind: 'found',
			snapshot: { etag: entry.etag, value: { type: 'notes', value: note } }
		});
	});

	it('returns no document body when the requested tag matches', async () => {
		const { note, owner } = await seedNote('8702');
		const identity = { type: 'notes' as const, id: [note.id] as [string] };
		const reader = new WorkspaceSyncObjects(context.db);
		const initial = await reader.read(owner, identity, null);
		if (initial.kind !== 'found') throw new Error('The seeded note was not returned');
		expect(await reader.read(owner, identity, initial.snapshot.etag)).toEqual({
			kind: 'unchanged',
			etag: initial.snapshot.etag
		});
	});

	it('does not disclose another account’s object', async () => {
		const { note } = await seedNote('8703');
		expect(
			await new WorkspaceSyncObjects(context.db).read(
				actor('8704'),
				{ type: 'notes', id: [note.id] },
				null
			)
		).toEqual({ kind: 'unavailable' });
	});

	it('distinguishes a server-deleted record from an unknown identity', async () => {
		const { note, owner } = await seedNote('8705');
		await context.client`delete from notes where id = ${note.id}`;
		expect(
			await new WorkspaceSyncObjects(context.db).read(owner, { type: 'notes', id: [note.id] }, null)
		).toEqual({ kind: 'deleted', etag: expect.stringMatching(/^sync-v1-/) });
	});

	it('normalizes absent todo fields instead of leaking database nulls', async () => {
		const { project, owner } = await seedNote('8706');
		const todoId = crypto.randomUUID();
		await context.client`insert into todos (id, user_id, project_id, title) values
			(${todoId}, ${owner.userId}, ${project.id}, 'Offline todo')`;
		const result = await new WorkspaceSyncObjects(context.db).read(
			owner,
			{ type: 'todos', id: [todoId] },
			null
		);
		if (result.kind !== 'found' || result.snapshot.value.type !== 'todos')
			throw new Error('The todo was not returned');
		expect(result.snapshot.value.value.linkedNoteId).toBeUndefined();
	});

	it('excludes server execution state from cached run status', async () => {
		const { owner } = await seedNote('8707');
		const conversationId = crypto.randomUUID();
		const runId = crypto.randomUUID();
		await context.client`insert into conversations (id, user_id) values (${conversationId}, ${owner.userId})`;
		await context.client`insert into agent_runs (id, kind, user_id, conversation_id, model, execution_mode, serialized_state)
			values (${runId}, 'agent', ${owner.userId}, ${conversationId}, 'contract-model', 'auto_accept', 'server-only-state')`;
		const result = await new WorkspaceSyncObjects(context.db).read(
			owner,
			{ type: 'agent_runs', id: [runId] },
			null
		);
		if (result.kind !== 'found') throw new Error('The run was not returned');
		expect(Object.keys(result.snapshot.value.value)).not.toContain('serializedState');
	});
});

it('retains unreadable chat messages as explicit records in the workspace cache', async () => {
	const { owner } = await seedNote('8731');
	const conversationId = crypto.randomUUID();
	const messageId = crypto.randomUUID();
	await context.client`insert into conversations (id, user_id) values (${conversationId}, ${owner.userId})`;
	await context.client`insert into messages (id, conversation_id, role, content) values (${messageId}, ${conversationId}, 'assistant', '[]'::jsonb)`;
	const result = await new WorkspaceSyncObjects(context.db).read(
		owner,
		{ type: 'messages', id: [messageId] },
		null
	);
	expect(
		result.kind === 'found' && result.snapshot.value.type === 'messages'
			? result.snapshot.value.value
			: null
	).toMatchObject({
		id: messageId,
		role: 'assistant',
		kind: 'unreadable',
		reason: 'The stored message content is not a readable object'
	});
});

it('reads message content and its ordering cursor without loss of precision', async () => {
	const { owner } = await seedNote('8732');
	const conversationId = crypto.randomUUID();
	const messageId = crypto.randomUUID();
	await context.client`insert into conversations (id, user_id) values (${conversationId}, ${owner.userId})`;
	const runId = crypto.randomUUID();
	await context.client`insert into agent_runs (id, kind, user_id, conversation_id, model, execution_mode) values (${runId}, 'agent', ${owner.userId}, ${conversationId}, 'contract-model', 'auto_accept')`;
	await context.client`insert into agent_run_events (cursor, run_id, attempt, event) overriding system value values (9007199254740993, ${runId}, 0, '{"type":"text_delta","text":"Saved answer"}'::jsonb)`;
	await context.client`insert into messages (id, conversation_id, role, content, event_cursor) values (${messageId}, ${conversationId}, 'assistant', '{"type":"text","text":"Saved answer"}'::jsonb, 9007199254740993)`;
	const result = await new WorkspaceSyncObjects(context.db).read(
		owner,
		{ type: 'messages', id: [messageId] },
		null
	);
	expect(
		result.kind === 'found' && result.snapshot.value.type === 'messages'
			? result.snapshot.value.value
			: null
	).toMatchObject({
		id: messageId,
		kind: 'readable',
		content: { type: 'text', text: 'Saved answer' },
		eventCursor: '9007199254740993'
	});
});
