import { expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { competingTreeWrites, treeControllers } from '../project-tree-harness';
import { context, now, seedNote } from '../database-harness';

it('refuses individual deletion after a concurrent restore commits', async () => {
	const { owner, note } = await seedNote('19401');
	const records = new NoteRecords(context.db);
	await records.update(owner, { ...note, archivedAt: now });
	const result = await competingTreeWrites(
		async (api) => {
			await api.notes.restore(owner, { noteId: note.id });
		},
		(api) => api.notes.deleteForever(owner, { noteId: note.id })
	);
	expect({ result, stored: await records.findById(owner, note.id) }).toMatchObject({
		result: { kind: 'failure', error: { code: 'VALIDATION' } },
		stored: { id: note.id, archivedAt: undefined }
	});
});

it('keeps a concurrently restored note when emptying project trash', async () => {
	const { owner, note, project } = await seedNote('19402');
	const records = new NoteRecords(context.db);
	await records.update(owner, { ...note, archivedAt: now });
	const result = await competingTreeWrites(
		async (api) => {
			await api.notes.restore(owner, { noteId: note.id });
		},
		(api) => api.notes.emptyTrash(owner, { projectId: project.id })
	);
	expect({ result, stored: await records.findById(owner, note.id) }).toMatchObject({
		result: { kind: 'success', value: { deletedNoteIds: [], deletedNotes: [] } },
		stored: { id: note.id, archivedAt: undefined }
	});
});

it('refuses restoring a note after its permanent deletion commits', async () => {
	const { owner, note } = await seedNote('19403');
	const records = new NoteRecords(context.db);
	await records.update(owner, { ...note, archivedAt: now });
	const result = await competingTreeWrites(
		async (api) => {
			await api.notes.deleteForever(owner, { noteId: note.id });
		},
		(api) => api.notes.restore(owner, { noteId: note.id })
	);
	expect({ result, stored: await records.findById(owner, note.id) }).toMatchObject({
		result: { kind: 'failure', error: { code: 'NOT_FOUND' } },
		stored: undefined
	});
});

it('preserves a restored child while permanently deleting its previous folder', async () => {
	const { owner, note } = await seedNote('19404');
	const records = new NoteRecords(context.db);
	await records.update(owner, { ...note, kind: 'folder', archivedAt: now });
	const child = await records.insert(owner, {
		...note,
		id: crypto.randomUUID() as NoteId,
		parentId: note.id,
		title: 'Restored child',
		archivedAt: now
	});
	await competingTreeWrites(
		async (api) => {
			await api.notes.restore(owner, { noteId: child.id });
		},
		(api) => api.notes.deleteForever(owner, { noteId: note.id })
	);
	expect({
		parent: await records.findById(owner, note.id),
		child: await records.findById(owner, child.id)
	}).toMatchObject({
		parent: undefined,
		child: { id: child.id, parentId: undefined, archivedAt: undefined }
	});
});

it('guards storage deletion against a restoration even without the controller project lock', async () => {
	const { owner, note } = await seedNote('19405');
	const records = new NoteRecords(context.db);
	await records.update(owner, { ...note, archivedAt: now });
	const result = await competingTreeWrites(
		async (api) => {
			await api.notes.restore(owner, { noteId: note.id });
		},
		(api) => api.records.deleteTrashed(owner, note.id)
	);
	expect({ result, stored: await records.findById(owner, note.id) }).toMatchObject({
		result: { kind: 'success', value: undefined },
		stored: { id: note.id, archivedAt: undefined }
	});
});

it('rolls back child deletion when PostgreSQL refuses the folder deletion', async () => {
	const { owner, note } = await seedNote('19406');
	const records = new NoteRecords(context.db);
	const parent = await records.update(owner, {
		...note,
		kind: 'folder',
		archivedAt: now,
		title: 'Purge rollback contract'
	});
	const child = await records.insert(owner, {
		...note,
		id: crypto.randomUUID() as NoteId,
		parentId: note.id,
		archivedAt: now
	});
	const { database, transactionRunner } = createTransactionContext(context.db);
	const api = treeControllers(database, transactionRunner);
	await context.client`create function reject_contract_note_deletion() returns trigger language plpgsql as $$
	begin
		if old.title = 'Purge rollback contract' then
			raise exception 'Deletion storage failed';
		end if;
		return old;
	end $$`;
	await context.client`create trigger reject_contract_note_deletion before delete on notes for each row execute function reject_contract_note_deletion()`;
	try {
		await api.notes.deleteForever(owner, { noteId: note.id }).catch(() => ({ kind: 'failure' }));
		expect({
			parent: await records.findById(owner, note.id),
			child: await records.findById(owner, child.id)
		}).toEqual({ parent, child });
	} finally {
		await context.client`drop trigger reject_contract_note_deletion on notes`;
		await context.client`drop function reject_contract_note_deletion()`;
	}
});
