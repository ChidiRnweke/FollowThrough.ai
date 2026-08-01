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
	testAnchorId,
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

	it('switching responsibility to mine clears the counterparty', async () => {
		const { service, todos } = setup();
		todos.todos = [todoBuilder({ responsibility: 'waiting_on', waitingOn: 'Sam' })];
		const updated = await service.update(
			testActor(),
			todoBuilder({ responsibility: 'mine', waitingOn: 'Sam' })
		);
		expect(updated.waitingOn).toBeUndefined();
	});

	it('links an active ordinary note in the todo project', async () => {
		const { service, todos, notes } = setup();
		todos.todos = [todoBuilder()];
		notes.notes = [noteBuilder()];
		const updated = await service.update(testActor(), todoBuilder({ linkedNoteId: testNoteId() }));
		expect(updated.linkedNoteId).toBe(testNoteId());
	});

	it.each([
		['another project', noteBuilder({ projectId: testProjectId(2) })],
		['a folder', noteBuilder({ kind: 'folder' })],
		['an archived note', noteBuilder({ archivedAt: '2026-07-17T09:00:00.000Z' as never })],
		['another user note', noteBuilder({ userId: testActor(2).userId })]
	])('rejects linking %s', async (_label, note) => {
		const { service, todos, notes } = setup();
		todos.todos = [todoBuilder()];
		notes.notes = [note];
		await expect(
			service.update(testActor(), todoBuilder({ linkedNoteId: note.id }))
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('clearing a linked note restores the anchor-derived source', async () => {
		const { service, todos, anchors, notes } = setup();
		todos.todos = [todoBuilder({ sourceAnchorId: testAnchorId() })];
		anchors.anchors = [anchorBuilder()];
		notes.notes = [noteBuilder()];
		const [view] = await service.assemble(testActor(), todos.todos);
		expect(view?.sourceNote?.id).toBe(testNoteId());
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
