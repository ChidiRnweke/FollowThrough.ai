import { describe, expect, it } from 'vitest';
import { initialSyncCursor } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { context, seedNote } from '../database-harness';

describe('compact account synchronization journal', () => {
	it('rejects owner changes that would silently change inherited child membership', async () => {
		const { project } = await seedNote('8811');
		const { owner: other } = await seedNote('8812');
		await expect(
			context.client`update projects set user_id = ${other.userId} where id = ${project.id}`
		).rejects.toMatchObject({ code: '23514' });
	});
	it('returns no changes when the client already holds the current cursor', async () => {
		const { owner } = await seedNote('8801');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pull(owner, initialSyncCursor);
		expect(await journal.pull(owner, initial.cursor)).toEqual({
			cursor: initial.cursor,
			changes: []
		});
	});

	it('returns only the latest version of an object changed repeatedly since the cursor', async () => {
		const { owner, note } = await seedNote('8802');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pull(owner, initialSyncCursor);
		await context.client`update notes set title = 'First rename' where id = ${note.id}`;
		await context.client`update notes set title = 'Second rename' where id = ${note.id}`;
		const batch = await journal.pull(owner, initial.cursor);
		expect(batch.changes).toEqual([
			{
				kind: 'upsert',
				key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
				etag: expect.stringMatching(/^sync-v1-/)
			}
		]);
	});

	it('retains an explicit tombstone after a cascading parent deletion', async () => {
		const { owner, note, project } = await seedNote('8803');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pull(owner, initialSyncCursor);
		await context.client`delete from projects where id = ${project.id}`;
		const batch = await journal.pull(owner, initial.cursor);
		expect(batch.changes).toContainEqual({
			kind: 'delete',
			key: workspaceResourceKey({ type: 'notes', id: [note.id] })
		});
	});

	it('does not send another account’s changes or tombstones', async () => {
		const { owner } = await seedNote('8804');
		const { note } = await seedNote('8805');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pull(owner, initialSyncCursor);
		await context.client`delete from notes where id = ${note.id}`;
		expect(await journal.pull(owner, initial.cursor)).toEqual({
			cursor: initial.cursor,
			changes: []
		});
	});

	it('rolls back both the journal and its cursor with a failed mutation', async () => {
		const { owner, note } = await seedNote('8806');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pull(owner, initialSyncCursor);
		await context.client
			.begin(async (transaction) => {
				await transaction`delete from notes where id = ${note.id}`;
				throw new Error('Reject mutation');
			})
			.catch(() => {
				return { kind: 'failure' };
			});
		expect(await journal.pull(owner, initial.cursor)).toEqual({
			cursor: initial.cursor,
			changes: []
		});
	});

	it('replaces a tombstone with an upsert when the same stable identity is recreated', async () => {
		const { owner, note } = await seedNote('8807');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pull(owner, initialSyncCursor);
		await context.client`delete from notes where id = ${note.id}`;
		await context.client`insert into notes (id, user_id, project_id, title)
			values (${note.id}, ${note.userId}, ${note.projectId}, 'Recreated')`;
		expect((await journal.pull(owner, initial.cursor)).changes).toEqual([
			{
				kind: 'upsert',
				key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
				etag: expect.stringMatching(/^sync-v1-/)
			}
		]);
	});

	it('does not advance the visible cursor past an uncommitted change', async () => {
		const { owner, note } = await seedNote('8808');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pull(owner, initialSyncCursor);
		const writer = connectPostgresTestDatabase(context.url);
		try {
			await writer.client`begin`;
			await writer.client`update notes set title = 'Not committed' where id = ${note.id}`;
			const during = await journal.pull(owner, initial.cursor);
			await writer.client`commit`;
			const after = await journal.pull(owner, during.cursor);
			expect({ during, keys: after.changes.map((change) => change.key) }).toEqual({
				during: { cursor: initial.cursor, changes: [] },
				keys: [workspaceResourceKey({ type: 'notes', id: [note.id] })]
			});
		} finally {
			await writer.client`rollback`;
			await writer.close();
		}
	});

	it('prevents a second writer from overtaking an uncommitted same-account cursor', async () => {
		const { owner, note } = await seedNote('8809');
		const { note: other } = await seedNote('8810', owner);
		const writer = connectPostgresTestDatabase(context.url);
		try {
			await writer.client`begin`;
			await writer.client`update notes set title = 'First transaction' where id = ${note.id}`;
			await expect(
				context.client.begin(async (transaction) => {
					await transaction`set local lock_timeout = '100ms'`;
					await transaction`update notes set title = 'Second transaction' where id = ${other.id}`;
				})
			).rejects.toMatchObject({ code: '55P03' });
		} finally {
			await writer.client`rollback`;
			await writer.close();
		}
	});
});
