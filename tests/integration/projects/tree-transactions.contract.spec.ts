import { expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { replaceNoteFixture, context, seedNote } from '../database-harness';
import { competingTreeWrites } from '../project-tree-harness';

it('refuses creation into a folder after a concurrent archive commits', async () => {
	const { owner, note, project } = await seedNote('19301');
	await replaceNoteFixture({ ...note, kind: 'folder' });
	const result = await competingTreeWrites(
		async (api) => {
			await api.notes.archive(owner, { noteId: note.id });
		},
		(api) => api.notes.create(owner, { projectId: project.id, parentId: note.id, title: 'Child' })
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'VALIDATION' } });
});

it('refuses archiving a folder after concurrent child creation commits', async () => {
	const { owner, note, project } = await seedNote('19302');
	await replaceNoteFixture({ ...note, kind: 'folder' });
	const result = await competingTreeWrites(
		async (api) => {
			await api.projects.createFolder(owner, {
				projectId: project.id,
				parentId: note.id,
				name: 'Child folder'
			});
		},
		(api) => api.notes.archive(owner, { noteId: note.id })
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'VALIDATION' } });
});

it('refuses the second of two moves that would create a folder cycle', async () => {
	const { owner, note, project } = await seedNote('19303');
	const records = new NoteRecords(context.db);
	await replaceNoteFixture({ ...note, kind: 'folder' });
	const peer = await records.insert(owner, {
		...note,
		id: crypto.randomUUID() as NoteId,
		kind: 'folder',
		title: 'Peer',
		position: 1
	});
	const result = await competingTreeWrites(
		async (api) => {
			await api.projects.move(owner, {
				projectId: project.id,
				entryId: note.id,
				parentId: peer.id,
				position: 0
			});
		},
		(api) =>
			api.projects.move(owner, {
				projectId: project.id,
				entryId: peer.id,
				parentId: note.id,
				position: 0
			})
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'VALIDATION' } });
});

it('assigns a later sibling position after concurrent creation commits', async () => {
	const { owner, project } = await seedNote('19304');
	const result = await competingTreeWrites(
		async (api) => {
			await api.notes.create(owner, { projectId: project.id, title: 'First new sibling' });
		},
		(api) => api.projects.createFolder(owner, { projectId: project.id, name: 'Second new sibling' })
	);
	expect(result).toMatchObject({ kind: 'success', value: { folder: { position: 2 } } });
});

it('refuses creation after a concurrent project archive commits', async () => {
	const { owner, project } = await seedNote('19305');
	const result = await competingTreeWrites(
		async (api) => {
			await api.projects.archive(owner, { projectId: project.id });
		},
		(api) => api.notes.create(owner, { projectId: project.id, title: 'Too late' })
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'NOT_FOUND' } });
});

it('refuses moving into a folder after a concurrent archive commits', async () => {
	const { owner, note, project } = await seedNote('19306');
	const parent = await new NoteRecords(context.db).insert(owner, {
		...note,
		id: crypto.randomUUID() as NoteId,
		kind: 'folder',
		title: 'Destination',
		position: 1
	});
	const result = await competingTreeWrites(
		async (api) => {
			await api.notes.archive(owner, { noteId: parent.id });
		},
		(api) =>
			api.projects.move(owner, {
				projectId: project.id,
				entryId: note.id,
				parentId: parent.id,
				position: 0
			})
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'NOT_FOUND' } });
});
