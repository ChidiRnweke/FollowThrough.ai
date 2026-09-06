import { describe, expect, it } from 'vitest';
import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';
import { WorkspaceSyncInventory } from '$lib/server/repositories/workspace/sync-inventory';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { actor, context, seedNote } from '../database-harness';

describe('conditional normalized object reads', () => {
	it('returns a normalized note and the version of that same database snapshot', async () => {
		const { note, owner } = await seedNote('8701');
		const identity = { type: 'notes' as const, id: [note.id] as [string] };
		const inventory = await new WorkspaceSyncInventory(context.db).list(owner);
		const entry = inventory.find((entry) => entry.key === workspaceResourceKey(identity));
		expect(await new WorkspaceSyncObjects(context.db).read(owner, identity, null)).toEqual({
			kind: 'found',
			snapshot: { etag: entry?.etag, value: { type: 'notes', value: note } }
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

	it('reports a record deleted since the inventory as unavailable', async () => {
		const { note, owner } = await seedNote('8705');
		await context.client`delete from notes where id = ${note.id}`;
		expect(
			await new WorkspaceSyncObjects(context.db).read(owner, { type: 'notes', id: [note.id] }, null)
		).toEqual({ kind: 'unavailable' });
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
