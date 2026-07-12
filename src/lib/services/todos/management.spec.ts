import { describe, expect, it } from 'vitest';
import { TodoManagementService } from './management';
import { InMemoryTodoRepository } from '$lib/testing/fakes/in-memory-todo-repository';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/fakes/in-memory-provenance-repository';
import {
	anchorBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testProjectId,
	testTodoId,
	todoBuilder
} from '$lib/testing/fixtures/domain-builders';

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
		service: new TodoManagementService(todos, projects, anchors, notes, provenance)
	};
};

describe('Todo management invariants', () => {
	it('trims a todo title at creation', async () => {
		const { service } = setup();
		const todo = await service.create(testActor(), {
			projectId: testProjectId(),
			title: '  Send design  ',
			responsibility: 'mine'
		});
		expect(todo.title).toBe('Send design');
	});

	it('requires a named counterparty for waiting-on work', async () => {
		const { service } = setup();
		await expect(
			service.create(testActor(), {
				projectId: testProjectId(),
				title: 'Receive spec',
				responsibility: 'waiting_on'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
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

	it('completing a todo records completion time', async () => {
		const { service, todos } = setup();
		todos.todos = [todoBuilder()];
		const completed = await service.change(testActor(), testTodoId(), 'done');
		expect(completed.completedAt).toBeDefined();
	});

	it('reopening a todo clears completion time', async () => {
		const { service, todos } = setup();
		todos.todos = [
			todoBuilder({ status: 'done', completedAt: '2026-07-11T09:00:00.000Z' as never })
		];
		const reopened = await service.change(testActor(), testTodoId(), 'open');
		expect(reopened.completedAt).toBeUndefined();
	});

	it('deleted todos disappear from active lists', async () => {
		const { service, todos } = setup();
		todos.todos = [todoBuilder()];
		await service.softDelete(testActor(), testTodoId());
		expect(await service.list(testActor(), {})).toEqual([]);
	});

	it('rejects an update carrying unavailable provenance', async () => {
		const { service, todos } = setup();
		todos.todos = [todoBuilder()];
		await expect(
			service.update(
				testActor(),
				todoBuilder({
					provenanceId: '00000000-0000-4000-0006-000000000099' as never
				})
			)
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
