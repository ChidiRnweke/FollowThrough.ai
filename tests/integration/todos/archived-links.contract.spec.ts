import { expect, it } from 'vitest';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { TodoCatalog } from '$lib/server/services/todos/catalog';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';
import { treeControllers } from '../project-tree-harness';

const archivedLink = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const records = new TodoRecords(database);
	const catalog = new TodoCatalog(
		records,
		new ProjectRecords(database),
		new SourceAnchorRecords(database),
		new NoteRecords(database),
		new ProvenanceRecords(database)
	);
	const controller = new Todos(
		capabilityDependencies<TodosDependencies>({
			todoCreator: catalog,
			todoEditor: catalog,
			todoContextReader: catalog,
			transactionRunner
		})
	);
	const { todo } = await controller.create(seeded.owner, {
		projectId: seeded.project.id,
		title: 'Send the draft',
		responsibility: 'mine'
	});
	await controller.update(seeded.owner, { todoId: todo.id, linkedNoteId: seeded.note.id });
	await treeControllers(database, transactionRunner).notes.archive(seeded.owner, {
		noteId: seeded.note.id
	});
	return { ...seeded, controller, records, todo };
};

it('persists completion after the linked note is archived through its controller', async () => {
	const { owner, note, controller, records, todo } = await archivedLink('20901');
	await controller.update(owner, { todoId: todo.id, status: 'done' });
	expect(await records.findById(owner, todo.id)).toMatchObject({
		status: 'done',
		linkedNoteId: note.id,
		completedAt: expect.any(String)
	});
});

it('persists text changes without discarding the archived link', async () => {
	const { owner, note, controller, records, todo } = await archivedLink('20902');
	await controller.update(owner, { todoId: todo.id, title: 'Send the revised draft' });
	expect(await records.findById(owner, todo.id)).toMatchObject({
		title: 'Send the revised draft',
		linkedNoteId: note.id
	});
});

it('refuses an explicit archived-link assignment before saving other requested edits', async () => {
	const { owner, note, controller, records, todo } = await archivedLink('20903');
	const outcome = await controller
		.update(owner, { todoId: todo.id, linkedNoteId: note.id, title: 'Must not persist' })
		.then(
			() => 'saved',
			() => 'rejected'
		);
	const stored = await records.findById(owner, todo.id);
	expect({ outcome, title: stored?.title, linkedNoteId: stored?.linkedNoteId }).toEqual({
		outcome: 'rejected',
		title: todo.title,
		linkedNoteId: note.id
	});
});

it('allows the user to clear an archived note link', async () => {
	const { owner, controller, records, todo } = await archivedLink('20904');
	await controller.update(owner, { todoId: todo.id, linkedNoteId: null });
	expect((await records.findById(owner, todo.id))?.linkedNoteId).toBeUndefined();
});
