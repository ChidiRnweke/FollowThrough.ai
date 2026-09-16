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
	anchorBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
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
	it('preserves the final identity assigned to a task before it was synchronized', async () => {
		const { service } = setup();
		const id = testTodoId(501);
		const todo = await service.create(testActor(), {
			id,
			projectId: testProjectId(),
			title: 'Offline task',
			responsibility: 'mine'
		});
		expect(todo.id).toBe(id);
	});
	it('trims a todo title at creation', async () => {
		const { service } = setup();
		const todo = await service.create(testActor(), {
			projectId: testProjectId(),
			title: '  Send design  ',
			responsibility: 'mine'
		});
		expect(todo.title).toBe('Send design');
	});

	it('allows waiting-on work without a named counterparty', async () => {
		const { service } = setup();
		const todo = await service.create(testActor(), {
			projectId: testProjectId(),
			title: 'Receive spec',
			responsibility: 'waiting_on'
		});
		expect(todo.waitingOn).toBeUndefined();
	});

	it('rejects a source anchor from another project', async () => {
		const { service, anchors, notes } = setup();
		anchors.anchors = [anchorBuilder()];
		notes.notes = [noteBuilder({ projectId: testProjectId(2) })];
		await expect(
			service.create(testActor(), {
				projectId: testProjectId(),
				title: 'Send design',
				responsibility: 'mine',
				sourceAnchorId: anchorBuilder().id
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('deleted todos disappear from active lists', async () => {
		const { service, todos } = setup();
		todos.todos = [todoBuilder()];
		await service.softDelete(testActor(), testTodoId());
		expect(await service.list(testActor(), {})).toEqual([]);
	});
});
