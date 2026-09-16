import { Todos, type TodosDependencies } from './controller';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { describe, expect, it } from 'vitest';
import { TodoCatalog } from '$lib/server/services/todos/catalog';
import { InMemoryTodoRepository } from '$lib/testing/todos/fakes/in-memory-todo-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const todos = new InMemoryTodoRepository();
	const projects = new InMemoryProjectRepository();
	const anchors = new InMemoryAnchorRepository();
	const notes = new InMemoryNoteRepository();
	const provenance = new InMemoryProvenanceRepository();
	projects.projects = [projectBuilder()];
	const service = new TodoCatalog(todos, projects, anchors, notes, provenance);
	const controller = new Todos(
		capabilityDependencies<TodosDependencies>({
			todoCreator: service,
			todoEditor: service,
			todoContextReader: service,
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
	it('clears a counterparty for personal work at creation as it does during editing', async () => {
		const { controller } = setup();
		const { todo: created } = await controller.create(testActor(), {
			projectId: testProjectId(),
			title: 'Send design',
			responsibility: 'mine',
			waitingOn: 'Sam'
		});
		const { todo: edited } = await controller.update(testActor(), {
			todoId: created.id,
			responsibility: 'mine',
			waitingOn: 'Sam'
		});
		expect([created.waitingOn, edited.waitingOn]).toEqual([undefined, undefined]);
	});
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
