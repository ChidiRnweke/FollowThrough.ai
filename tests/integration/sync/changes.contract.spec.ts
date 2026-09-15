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
		const initial = await journal.pullPage(owner, initialSyncCursor);
		expect(await journal.pullPage(owner, initial.cursor)).toEqual({
			cursor: initial.cursor,
			records: [],
			hasMore: false
		});
	});

	it('returns only the latest version of an object changed repeatedly since the cursor', async () => {
		const { owner, note } = await seedNote('8802');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pullPage(owner, initialSyncCursor);
		await context.client`update notes set title = 'First rename' where id = ${note.id}`;
		await context.client`update notes set title = 'Second rename' where id = ${note.id}`;
		const batch = await journal.pullPage(owner, initial.cursor);
		expect(batch.records).toEqual([
			{
				key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
				resource: expect.objectContaining({ kind: 'found' })
			}
		]);
	});

	it('retains an explicit tombstone after a cascading parent deletion', async () => {
		const { owner, note, project } = await seedNote('8803');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pullPage(owner, initialSyncCursor);
		await context.client`delete from projects where id = ${project.id}`;
		const batch = await journal.pullPage(owner, initial.cursor);
		expect(batch.records).toContainEqual({
			resource: { kind: 'deleted', etag: expect.stringMatching(/^sync-v1-/) },
			key: workspaceResourceKey({ type: 'notes', id: [note.id] })
		});
	});

	it('does not send another account’s changes or tombstones', async () => {
		const { owner } = await seedNote('8804');
		const { note } = await seedNote('8805');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pullPage(owner, initialSyncCursor);
		await context.client`delete from notes where id = ${note.id}`;
		expect(await journal.pullPage(owner, initial.cursor)).toEqual({
			cursor: initial.cursor,
			records: [],
			hasMore: false
		});
	});

	it('rolls back both the journal and its cursor with a failed mutation', async () => {
		const { owner, note } = await seedNote('8806');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pullPage(owner, initialSyncCursor);
		await context.client
			.begin(async (transaction) => {
				await transaction`delete from notes where id = ${note.id}`;
				throw new Error('Reject mutation');
			})
			.catch(() => {
				return { kind: 'failure' };
			});
		expect(await journal.pullPage(owner, initial.cursor)).toEqual({
			cursor: initial.cursor,
			records: [],
			hasMore: false
		});
	});

	it('replaces a tombstone with an upsert when the same stable identity is recreated', async () => {
		const { owner, note } = await seedNote('8807');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pullPage(owner, initialSyncCursor);
		await context.client`delete from notes where id = ${note.id}`;
		await context.client`insert into notes (id, user_id, project_id, title)
			values (${note.id}, ${note.userId}, ${note.projectId}, 'Recreated')`;
		expect((await journal.pullPage(owner, initial.cursor)).records).toEqual([
			{
				key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
				resource: expect.objectContaining({ kind: 'found' })
			}
		]);
	});

	it('does not advance the visible cursor past an uncommitted change', async () => {
		const { owner, note } = await seedNote('8808');
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pullPage(owner, initialSyncCursor);
		const writer = connectPostgresTestDatabase(context.url);
		try {
			await writer.client`begin`;
			await writer.client`update notes set title = 'Not committed' where id = ${note.id}`;
			const during = await journal.pullPage(owner, initial.cursor);
			await writer.client`commit`;
			const after = await journal.pullPage(owner, during.cursor);
			expect({ during, keys: after.records.map((change) => change.key) }).toEqual({
				during: { cursor: initial.cursor, records: [], hasMore: false },
				keys: [workspaceResourceKey({ type: 'notes', id: [note.id] })]
			});
		} finally {
			await writer.client`rollback`;
			await writer.close();
		}
	});

	it('assigns cursors at publication so a later transaction can commit first without hiding changes', async () => {
		const { owner, note } = await seedNote('8809');
		const { note: other } = await seedNote('8810', owner);
		const journal = new WorkspaceSyncChanges(context.db);
		const initial = await journal.pullPage(owner, initialSyncCursor);
		const writer = connectPostgresTestDatabase(context.url);
		try {
			await writer.client`begin`;
			await writer.client`update notes set title = 'First transaction' where id = ${note.id}`;
			await context.client`update notes set title = 'Second transaction' where id = ${other.id}`;
			const firstCommit = await journal.pullPage(owner, initial.cursor);
			await writer.client`commit`;
			const lastCommit = await journal.pullPage(owner, firstCommit.cursor);
			expect({
				first: firstCommit.records.map((change) => change.key),
				last: lastCommit.records.map((change) => change.key)
			}).toEqual({
				first: [workspaceResourceKey({ type: 'notes', id: [other.id] })],
				last: [workspaceResourceKey({ type: 'notes', id: [note.id] })]
			});
		} finally {
			await writer.client`rollback`;
			await writer.close();
		}
	});
});

it('retains every journal record across page checkpoints', async () => {
	const { owner, project } = await seedNote('8820');
	await context.client`insert into notes (user_id, project_id, kind, title) select ${owner.userId}::uuid, ${project.id}::uuid, 'note', 'Page note ' || n from generate_series(1, 600) n`;
	const journal = new WorkspaceSyncChanges(context.db);
	const expected =
		await context.client`select resource_type, resource_id from workspace_sync_changes where account_id = ${owner.userId}`;
	const [head] =
		await context.client`select cursor::text from workspace_sync_heads where account_id = ${owner.userId}`;
	const keys = new Set<string>();
	let cursor = initialSyncCursor;
	let more: boolean;
	do {
		const page = await journal.pullPage(owner, cursor);
		for (const change of page.records) keys.add(change.key);
		cursor = page.cursor;
		more = page.hasMore;
	} while (more);
	expect({ keys: [...keys].sort(), cursor }).toEqual({
		keys: expected.map((row) => JSON.stringify([row.resource_type, ...row.resource_id])).sort(),
		cursor: head.cursor
	});
});
it('includes a resource moved beyond the current page checkpoint by a concurrent edit', async () => {
	const { owner, project, note } = await seedNote('8821');
	await context.client`insert into notes (user_id, project_id, kind, title) select ${owner.userId}::uuid, ${project.id}::uuid, 'note', 'Page note ' || n from generate_series(1, 300) n`;
	const journal = new WorkspaceSyncChanges(context.db);
	const first = await journal.pullPage(owner, initialSyncCursor);
	await context.client`update notes set title = 'Changed between pages' where id = ${note.id}`;
	const keys: string[] = [];
	let cursor = first.cursor;
	let more: boolean;
	do {
		const page = await journal.pullPage(owner, cursor);
		keys.push(...page.records.map((change) => change.key));
		cursor = page.cursor;
		more = page.hasMore;
	} while (more);
	expect(keys).toContain(workspaceResourceKey({ type: 'notes', id: [note.id] }));
});

it('includes the current body with the journal version in the same page', async () => {
	const { owner, note } = await seedNote('8830');
	const journal = new WorkspaceSyncChanges(context.db);
	const initial = await journal.pullPage(owner, initialSyncCursor);
	await context.client`update notes set title = 'Complete page' where id = ${note.id}`;
	const page = await journal.pullPage(owner, initial.cursor);
	expect(page.records).toEqual([
		{
			key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
			resource: {
				kind: 'found',
				snapshot: {
					etag: expect.stringMatching(/^sync-v1-/),
					value: {
						type: 'notes',
						value: expect.objectContaining({ id: note.id, title: 'Complete page' })
					}
				}
			}
		}
	]);
});

it('fails a complete page when a selected live resource lost its version metadata', async () => {
	const { owner, note } = await seedNote('8831');
	const journal = new WorkspaceSyncChanges(context.db);
	const initial = await journal.pullPage(owner, initialSyncCursor);
	await context.client`update notes set title = 'Needs metadata' where id = ${note.id}`;
	await context.client.begin(async (tx) => {
		await tx`set local session_replication_role = replica`;
		await tx`delete from workspace_sync_versions where resource_type = 'notes' and resource_id = ${JSON.stringify([note.id])}::jsonb`;
	});
	await expect(journal.pullPage(owner, initial.cursor)).rejects.toThrow();
});
