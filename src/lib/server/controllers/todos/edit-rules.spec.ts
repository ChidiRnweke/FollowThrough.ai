import { createTodoServices } from '$lib/server/factories/capabilities/todos-capability-factory';
import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryTodoRepository } from '$lib/testing/todos/fakes/in-memory-todo-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Todos, type TodosDependencies } from './controller';

const setup = () => {
	const todos = new InMemoryTodoRepository();
	const projects = new InMemoryProjectRepository();
	const anchors = new InMemoryAnchorRepository();
	const notes = new InMemoryNoteRepository();
	const provenance = new InMemoryProvenanceRepository();
	projects.projects = [projectBuilder()];
	const service = createTodoServices(todos, projects, anchors, notes, provenance);
	const controller = new Todos(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<TodosDependencies>({
			...agentToolResultsFixture(),
			boardExport: new TodoBoardExportService(),
			todoPresentation: new TodoPresentationService(),
			todoEditingRules: new TodoEditingRulesService(),
			todoCreationRules: new TodoEditingRulesService(),
			todoCreator: service.creator,
			todoEditor: service.editor,
			todoContextReader: service.context,
			transactionRunner: new InMemoryTransactionRunner([todos])
		})
	);
	return {
		todos,
		projects,
		anchors,
		notes,
		provenance,
		controller
	};
};

describe('Task edit rules', () => {
	it('switching responsibility to mine clears the counterparty', async () => {
		const { controller, todos } = setup();
		todos.todos = [todoBuilder({ responsibility: 'waiting_on', waitingOn: 'Sam' })];
		const { todo: updated } = await controller.update(testActor(), {
			todoId: testTodoId(),
			responsibility: 'mine',
			waitingOn: 'Sam'
		});
		expect(updated.waitingOn).toBeUndefined();
	});
	it('links an active ordinary note in the todo project', async () => {
		const { controller, todos, notes } = setup();
		todos.todos = [todoBuilder()];
		notes.notes = [noteBuilder()];
		const { todo: updated } = await controller.update(testActor(), {
			todoId: testTodoId(),
			linkedNoteId: testNoteId()
		});
		expect(updated.linkedNoteId).toBe(testNoteId());
	});
	it('completes an existing task after its linked note is archived', async () => {
		const { controller, todos, notes } = setup();
		todos.todos = [todoBuilder()];
		const note = noteBuilder();
		notes.notes = [note];
		await controller.update(testActor(), { todoId: testTodoId(), linkedNoteId: note.id });
		notes.notes = [{ ...note, archivedAt: '2026-09-23T10:00:00.000Z' as never }];
		const { todo } = await controller.update(testActor(), { todoId: testTodoId(), status: 'done' });
		expect({ status: todo.status, linkedNoteId: todo.linkedNoteId }).toEqual({
			status: 'done',
			linkedNoteId: note.id
		});
	});
	it('still refuses explicitly assigning an archived note that was linked earlier', async () => {
		const { controller, todos, notes } = setup();
		todos.todos = [todoBuilder()];
		const note = noteBuilder();
		notes.notes = [note];
		await controller.update(testActor(), { todoId: testTodoId(), linkedNoteId: note.id });
		notes.notes = [{ ...note, archivedAt: '2026-09-23T10:00:00.000Z' as never }];
		await expect(
			controller.update(testActor(), { todoId: testTodoId(), linkedNoteId: note.id })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
	it.each([
		['another project', noteBuilder({ projectId: testProjectId(2) })],
		['a folder', noteBuilder({ kind: 'folder' })],
		['an archived note', noteBuilder({ archivedAt: '2026-07-17T09:00:00.000Z' as never })],
		['another user note', noteBuilder({ userId: testActor(2).userId })]
	])('rejects linking %s', async (_label, note) => {
		const { controller, todos, notes } = setup();
		todos.todos = [todoBuilder()];
		notes.notes = [note];
		await expect(
			controller.update(testActor(), { todoId: testTodoId(), linkedNoteId: note.id })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
	it('completing a todo records completion time', async () => {
		const { controller, todos } = setup();
		todos.todos = [todoBuilder()];
		const { todo: completed } = await controller.update(testActor(), {
			todoId: testTodoId(),
			status: 'done'
		});
		expect(completed.completedAt).toBeDefined();
	});
	it('reopening a todo clears completion time', async () => {
		const { controller, todos } = setup();
		todos.todos = [
			todoBuilder({ status: 'done', completedAt: '2026-07-11T09:00:00.000Z' as never })
		];
		const { todo: reopened } = await controller.update(testActor(), {
			todoId: testTodoId(),
			status: 'open'
		});
		expect(reopened.completedAt).toBeUndefined();
	});
});
