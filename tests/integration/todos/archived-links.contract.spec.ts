import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createTodoServices } from '$lib/server/factories/capabilities/todos-capability-factory';
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
	const records = new TodoRecords(testActor(), database);
	const catalog = createTodoServices(
		testActor(),
		records,
		new ProjectRecords(testActor(), database),
		new SourceAnchorRecords(testActor(), database),
		new NoteRecords(testActor(), database),
		new ProvenanceRecords(testActor(), database)
	);
	const controller = new Todos(
		testActor(),
		new WorkspaceCommandRulesService(),
		capabilityDependencies<TodosDependencies>({
			...agentToolResultsFixture(),
			boardExport: new TodoBoardExportService(),
			todoPresentation: new TodoPresentationService(),
			todoEditingRules: new TodoEditingRulesService(),
			todoCreationRules: new TodoEditingRulesService(),
			todoCreator: catalog.creator,
			todoEditor: catalog.editor,
			todoContextReader: catalog.context,
			transactionRunner
		})
	);
	const { todo } = await controller.create({
		projectId: seeded.project.id,
		title: 'Send the draft',
		responsibility: 'mine'
	});
	await controller.update({ todoId: todo.id, linkedNoteId: seeded.note.id });
	await treeControllers(database, transactionRunner).notes.archive({
		noteId: seeded.note.id
	});
	return { ...seeded, controller, records, todo };
};

it('persists completion after the linked note is archived through its controller', async () => {
	const { owner, note, controller, records, todo } = await archivedLink('20901');
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
	const { owner, note, controller, records, todo } = await archivedLink('20903');
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
	const { owner, controller, records, todo } = await archivedLink('20904');
	await controller.update({ todoId: todo.id, linkedNoteId: null });
	expect((await records.findById(todo.id))?.linkedNoteId).toBeUndefined();
});
