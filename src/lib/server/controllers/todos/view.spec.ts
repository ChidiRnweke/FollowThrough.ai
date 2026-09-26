import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { expect, it } from 'vitest';
import { Todos, type TodosDependencies } from './controller';
import { TodoCatalog } from '$lib/server/services/todos/catalog';
import { InMemoryTodoRepository } from '$lib/testing/todos/fakes/in-memory-todo-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	todoBuilder,
	noteBuilder,
	anchorBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

it('clearing a linked note restores the extraction origin in the returned task view', async () => {
	const tasks = new InMemoryTodoRepository();
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const origin = noteBuilder({ title: 'Meeting' });
	const linked = noteBuilder({ id: testNoteId(2), title: 'Work plan' });
	const anchor = anchorBuilder({ noteId: origin.id });
	const task = todoBuilder({ linkedNoteId: linked.id, sourceAnchorId: anchor.id });
	tasks.todos = [task];
	notes.notes = [origin, linked];
	anchors.anchors = [anchor];
	const catalog = new TodoCatalog(
		tasks,
		new InMemoryProjectRepository(),
		anchors,
		notes,
		new InMemoryProvenanceRepository()
	);
	const controller = new Todos(
		capabilityDependencies<TodosDependencies>({
			todoEditor: catalog,
			todoContextReader: catalog,
			transactionRunner: new InMemoryTransactionRunner([tasks])
		})
	);
	const result = await controller.update(testActor(), { todoId: task.id, linkedNoteId: null });
	expect({
		linked: result.todo.linkedNoteId,
		source: result.view.sourceNote,
		origin: result.view.originNote
	}).toEqual({
		linked: undefined,
		source: { id: origin.id, title: origin.title },
		origin: { id: origin.id, title: origin.title }
	});
});
