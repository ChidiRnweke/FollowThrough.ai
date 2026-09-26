import { describe, expect, it } from 'vitest';
import { Todos, type TodosDependencies } from './controller';
import { TodoCatalog } from '$lib/server/services/todos/catalog';
import { TodoBatchReceipts } from '$lib/server/services/todos/batch-receipts';
import { InMemoryTodoRepository } from '$lib/testing/todos/fakes/in-memory-todo-repository';
import { InMemoryTodoBatchReceipts } from '$lib/testing/todos/fakes/in-memory-todo-batch-receipts';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	projectBuilder,
	testActor,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { createTodoBatchSchema } from '$lib/models/todos';

const setup = () => {
	const records = new InMemoryTodoRepository();
	const receipts = new InMemoryTodoBatchReceipts();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const catalog = new TodoCatalog(
		records,
		projects,
		new InMemoryAnchorRepository(),
		new InMemoryNoteRepository(),
		new InMemoryProvenanceRepository()
	);
	const controller = new Todos(
		capabilityDependencies<TodosDependencies>({
			todoCreator: catalog,
			todoBatchReceipts: new TodoBatchReceipts(receipts),
			transactionRunner: new InMemoryTransactionRunner([records, receipts])
		})
	);
	const input = createTodoBatchSchema.parse({
		requestId: crypto.randomUUID(),
		projectId: testProjectId(),
		todos: [
			{ title: 'First', responsibility: 'mine' },
			{ title: 'Second', responsibility: 'mine' }
		]
	});
	return { records, receipts, controller, input };
};

describe('durable task batches', () => {
	it('rolls back earlier tasks when a later insert fails', async () => {
		const { records, receipts, controller, input } = setup();
		records.insertFailures.set('Second', new Error('Storage unavailable'));
		const outcome = await controller.createBatch(testActor(), input).then(
			() => 'saved',
			(error: Error) => error.message
		);
		expect({ outcome, todos: records.todos, receipts: receipts.receipts.size }).toEqual({
			outcome: 'Storage unavailable',
			todos: [],
			receipts: 0
		});
	});
	it('rolls back every task when its outcome cannot be saved', async () => {
		const { records, receipts, controller, input } = setup();
		receipts.saveError = new Error('Receipt unavailable');
		const outcome = await controller.createBatch(testActor(), input).then(
			() => 'saved',
			(error: Error) => error.message
		);
		expect({ outcome, todos: records.todos }).toEqual({
			outcome: 'Receipt unavailable',
			todos: []
		});
	});
	it('returns the saved result without creating duplicates after a lost response', async () => {
		const { records, controller, input } = setup();
		const original = await controller.createBatch(testActor(), input);
		const retried = await controller.createBatch(testActor(), input);
		expect({
			retried,
			stored: records.todos,
			titles: retried.todos.map((todo) => todo.title)
		}).toEqual({ retried: original, stored: original.todos, titles: ['First', 'Second'] });
	});
	it('rejects reuse of a request ID for changed input', async () => {
		const { records, controller, input } = setup();
		const original = await controller.createBatch(testActor(), input);
		const outcome = await controller
			.createBatch(testActor(), {
				...input,
				todos: [{ title: 'Different', responsibility: 'mine' }]
			})
			.then(
				() => 'saved',
				(error: Error) => error.message
			);
		expect({ outcome, stored: records.todos }).toEqual({
			outcome: 'The task batch request ID was already used for different input',
			stored: original.todos
		});
	});
});
