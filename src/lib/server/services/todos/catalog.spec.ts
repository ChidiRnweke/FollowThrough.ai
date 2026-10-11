import { describe, expect, it } from 'vitest';
import { createTodoServices } from '$lib/server/factories/capabilities/todos-capability-factory';
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
	const todos = new InMemoryTodoRepository(testActor());
	const projects = new InMemoryProjectRepository(testActor());
	const anchors = new InMemoryAnchorRepository(testActor());
	const notes = new InMemoryNoteRepository(testActor());
	const provenance = new InMemoryProvenanceRepository(testActor());
	projects.projects = [projectBuilder()];
	return {
		todos,
		projects,
		anchors,
		notes,
		provenance,
		service: createTodoServices(testActor(), todos, projects, anchors, notes, provenance)
	};
};

describe('Todo management invariants', () => {
	it('rejects a resolved task belonging to another actor', async () => {
		const { service } = setup();
		await expect(
			service.creator.create(todoBuilder({ userId: testActor(2).userId }))
		).rejects.toMatchObject({ code: 'OWNERSHIP' });
	});

	it('deleted todos disappear from active lists', async () => {
		const { service, todos } = setup();
		todos.todos = [todoBuilder()];
		await service.deleter.softDelete(testTodoId());
		expect(await service.lister.list({})).toEqual([]);
	});
});
