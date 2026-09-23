import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { todos } from '$lib/server/db/schema/todos';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { SuggestionEffectRecords } from '$lib/server/repositories/suggestions/postgres/application-effects';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, now, seedNote } from '../database-harness';

it.each([
	{ status: 'done' as const, completedAt: null },
	{ status: 'open' as const, completedAt: new Date(now) }
])('refuses an inconsistent stored completion state: $status', async (corrupt) => {
	const { owner, project } = await seedNote(corrupt.status === 'done' ? '20601' : '20602');
	const records = new TodoRecords(context.db);
	const task = await records.insert(
		owner,
		todoBuilder({
			id: testTodoId(corrupt.status === 'done' ? 20601 : 20602),
			userId: owner.userId,
			projectId: project.id
		})
	);
	// Negative boundary fixture: bypass domain writers to represent corrupt external storage.
	await context.db.update(todos).set(corrupt).where(eq(todos.id, task.id));
	await expect(records.findById(owner, task.id)).rejects.toThrow();
});

it.each(['done', 'open'] as const)(
	'restores a task completion state from an application effect: %s',
	async (status) => {
		const suffix = status === 'done' ? '20603' : '20604';
		const { owner, project } = await seedNote(suffix);
		const records = new TodoRecords(context.db);
		const before = await records.insert(
			owner,
			todoBuilder({
				id: testTodoId(Number(suffix)),
				userId: owner.userId,
				projectId: project.id,
				status
			})
		);
		const after = await records.update(
			owner,
			status === 'done'
				? { ...before, status: 'open', completedAt: undefined }
				: { ...before, status: 'done', completedAt: now }
		);
		await new SuggestionEffectRecords(context.db).restore(owner, {
			kind: 'modified',
			before: { type: 'todos', value: before },
			after: { type: 'todos', value: after }
		});
		const restored = await records.findById(owner, before.id);
		expect({ status: restored?.status, completedAt: restored?.completedAt }).toEqual({
			status: before.status,
			completedAt: before.completedAt
		});
	}
);
