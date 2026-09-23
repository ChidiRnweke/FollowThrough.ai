import { describe, expect, it } from 'vitest';
import { TodoCatalog } from './catalog';
import { InMemoryTodoRepository } from '$lib/testing/todos/fakes/in-memory-todo-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	projectBuilder,
	testActor,
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
	return {
		todos,
		projects,
		anchors,
		notes,
		provenance,
		service: new TodoCatalog(todos, projects, anchors, notes, provenance)
	};
};

describe('Todo management invariants', () => {
	it('rejects a resolved task belonging to another actor', async () => {
		const { service } = setup();
		await expect(
			service.create(testActor(), todoBuilder({ userId: testActor(2).userId }))
		).rejects.toMatchObject({ code: 'OWNERSHIP' });
	});

	it('deleted todos disappear from active lists', async () => {
		const { service, todos } = setup();
		todos.todos = [todoBuilder()];
		await service.softDelete(testActor(), testTodoId());
		expect(await service.list(testActor(), {})).toEqual([]);
	});
});
