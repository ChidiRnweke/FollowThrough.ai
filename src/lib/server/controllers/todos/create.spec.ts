import { prepareWorkspaceCommand } from '$lib/controllers/workspace/commands';
import type { CreateTodoInput } from '$lib/models/todos';
import { Todos, type TodosDependencies } from './controller';
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
	anchorBuilder,
	noteBuilder,
	projectBuilder,
	testActor,
	testNow,
	testProjectId,
	testTodoId
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
		capabilityDependencies<TodosDependencies>({ todoCreator: service }),
		() => testNow
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

describe('Task creation rules', () => {
	const variants: readonly Pick<CreateTodoInput, 'responsibility' | 'waitingOn' | 'status'>[] = [
		{ responsibility: 'mine', waitingOn: 'Sam' },
		{ responsibility: 'waiting_on', waitingOn: '  Sam  ' },
		{ responsibility: 'mine', status: 'done' }
	];
	it.each(variants)(
		'stores the same initial task as the offline preview for %j',
		async (variant) => {
			const { controller, todos } = setup();
			const input = {
				id: testTodoId(),
				projectId: testProjectId(),
				title: '  Send design  ',
				...variant
			};
			const preview = prepareWorkspaceCommand({ kind: 'createTodo', ...input }, null, {
				userId: testActor().userId,
				now: testNow,
				records: new Map(),
				inventory: 'complete'
			});
			const { todo } = await controller.create(testActor(), input);
			expect({ returned: todo, stored: todos.todos }).toEqual({
				returned: preview.local?.value,
				stored: [preview.local?.value]
			});
		}
	);
	it('rejects a blank title before creating a task', async () => {
		const { controller, todos } = setup();
		const result = await controller
			.create(testActor(), { projectId: testProjectId(), title: '  ', responsibility: 'mine' })
			.then(
				() => 'saved',
				(error: Error) => error.message
			);
		expect({ result, stored: todos.todos }).toEqual({
			result: 'Todo title is required',
			stored: []
		});
	});
	it.each([
		['another account', projectBuilder({ userId: testActor(2).userId })],
		['archived', projectBuilder({ archivedAt: testNow })]
	])('rejects creating a task in an unavailable project: %s', async (_label, project) => {
		const { controller, projects } = setup();
		projects.projects = [project];
		await expect(
			controller.create(testActor(), {
				projectId: project.id,
				title: 'Send design',
				responsibility: 'mine'
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('preserves the final identity assigned to a task before it was synchronized', async () => {
		const { controller } = setup();
		const id = testTodoId(501);
		const { todo } = await controller.create(testActor(), {
			id,
			projectId: testProjectId(),
			title: 'Offline task',
			responsibility: 'mine'
		});
		expect(todo.id).toBe(id);
	});
	it('trims a todo title at creation', async () => {
		const { controller } = setup();
		const { todo } = await controller.create(testActor(), {
			projectId: testProjectId(),
			title: '  Send design  ',
			responsibility: 'mine'
		});
		expect(todo.title).toBe('Send design');
	});
	it('allows waiting-on work without a named counterparty', async () => {
		const { controller } = setup();
		const { todo } = await controller.create(testActor(), {
			projectId: testProjectId(),
			title: 'Receive spec',
			responsibility: 'waiting_on'
		});
		expect(todo.waitingOn).toBeUndefined();
	});
	it('rejects a source anchor from another project', async () => {
		const { controller, anchors, notes } = setup();
		anchors.anchors = [anchorBuilder()];
		notes.notes = [noteBuilder({ projectId: testProjectId(2) })];
		await expect(
			controller.create(testActor(), {
				projectId: testProjectId(),
				title: 'Send design',
				responsibility: 'mine',
				sourceAnchorId: anchorBuilder().id
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
