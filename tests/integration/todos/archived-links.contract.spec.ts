import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createTodoCatalog } from '$lib/server/factories/capabilities/todos-capability-factory';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { expect, it } from 'vitest';
import { context, seedNote } from '../database-harness';
import { treeControllers } from '../project-tree-harness';

const archivedLink = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const records = new TodoRecords(seeded.owner, database);
	const catalog = createTodoCatalog(
		seeded.owner,
		records,
		new ProjectRecords(seeded.owner, database),
		new SourceAnchorRecords(seeded.owner, database),
		new NoteRecords(seeded.owner, database),
		new ProvenanceRecords(seeded.owner, database),
		testClock
	);
	const controller = new Todos(
		seeded.owner,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<TodosDependencies>({
			now: testClock,
			...agentToolResultsFixture(),
			boardExport: new TodoBoardExportService(),
			todoPresentation: new TodoPresentationService(),
			todoEditingRules: new TodoEditingRulesService(),
			todoCreationRules: new TodoEditingRulesService(),
			todoLibrary: catalog,
			transactionRunner
		})
	);
	const { todo } = await controller.create({
		projectId: seeded.project.id,
		title: 'Send the draft',
		responsibility: 'mine'
	});
	await controller.update({ todoId: todo.id, linkedNoteId: seeded.note.id });
	await treeControllers(seeded.owner, database, transactionRunner).notes.archive({
		noteId: seeded.note.id
	});
	return { ...seeded, controller, records, todo };
};

it('persists completion after the linked note is archived through its controller', async () => {
	const { note, controller, records, todo } = await archivedLink('20901');
	await controller.update({
		todoId: todo.id,
		status: 'done',
		title: 'Send the revised draft'
	});
	expect(await records.findById(todo.id)).toMatchObject({
		status: 'done',
		title: 'Send the revised draft',
		linkedNoteId: note.id,
		completedAt: expect.any(String)
	});
});

it('refuses an explicit archived-link assignment before saving other requested edits', async () => {
	const { note, controller, records, todo } = await archivedLink('20903');
	const outcome = await controller
		.update({ todoId: todo.id, linkedNoteId: note.id, title: 'Must not persist' })
		.then(
			() => 'saved',
			() => 'rejected'
		);
	const stored = await records.findById(todo.id);
	expect({ outcome, title: stored?.title, linkedNoteId: stored?.linkedNoteId }).toEqual({
		outcome: 'rejected',
		title: todo.title,
		linkedNoteId: note.id
	});
});

it('allows the user to clear an archived note link', async () => {
	const { controller, records, todo } = await archivedLink('20904');
	await controller.update({ todoId: todo.id, linkedNoteId: null });
	expect((await records.findById(todo.id))?.linkedNoteId).toBeUndefined();
});
