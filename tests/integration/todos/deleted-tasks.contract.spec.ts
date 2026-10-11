import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { todos } from '$lib/server/db/schema/todos';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, now, seedNote } from '../database-harness';

const setup = async (suffix: string, identity: number) => {
	const { owner, project } = await seedNote(suffix);
	const repository = new TodoRecords(owner, context.db);
	const task = await repository.insert(
		todoBuilder({
			id: testTodoId(identity),
			userId: owner.userId,
			projectId: project.id,
			title: 'Original task'
		})
	);
	await repository.softDelete(task.id, now);
	return { owner, repository, task };
};

it('does not return a deleted task through its identity', async () => {
	const { repository, task } = await setup('14801', 14801);
	expect(await repository.findById(task.id)).toBeUndefined();
});

it('does not list a deleted task', async () => {
	const { repository } = await setup('14804', 14804);
	expect(await repository.list({})).toEqual([]);
});

it('rejects a stale edit without restoring a deleted task', async () => {
	const { repository, task } = await setup('14802', 14802);
	const outcome = await repository.update({ ...task, title: 'Late edit' }).then(
		() => 'saved',
		(error: Error) => error.message
	);
	const [stored] = await context.db.select().from(todos).where(eq(todos.id, task.id));
	expect({ outcome, title: stored?.title, deleted: stored?.deletedAt?.toISOString() }).toEqual({
		outcome: 'Todo was not found',
		title: 'Original task',
		deleted: now
	});
});

it('does not return a deleted task through the locking edit read', async () => {
	const { repository, task } = await setup('14803', 14803);
	expect(await repository.findForUpdate(task.id)).toBeUndefined();
});
