import { expect, it } from 'vitest';
import { TodoBatchReceipts } from './batch-receipts';
import { createTodoBatchSchema } from '$lib/models/todos';
import { InMemoryTodoBatchReceipts } from '$lib/testing/todos/fakes/in-memory-todo-batch-receipts';
import {
	testActor,
	testProjectId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

it('refuses a saved request identity when the task content changes', async () => {
	const service = new TodoBatchReceipts(new InMemoryTodoBatchReceipts());
	const input = createTodoBatchSchema.parse({
		requestId: crypto.randomUUID(),
		projectId: testProjectId(),
		todos: [{ title: 'Original', responsibility: 'mine' }]
	});
	await service.save(testActor(), input, { todos: [todoBuilder({ title: 'Original' })] });
	await expect(
		service.findForUpdate(testActor(), {
			...input,
			todos: [{ title: 'Changed', responsibility: 'mine' }]
		})
	).rejects.toMatchObject({ code: 'VALIDATION' });
});
