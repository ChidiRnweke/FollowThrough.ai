import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { todos } from '$lib/server/db/schema/todos';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, now, seedNote } from '../database-harness';

const setup = async (suffix: string, identity: number) => {
	const { owner, project } = await seedNote(suffix);
	const repository = new TodoRecords(context.db);
	const task = await repository.insert(
		owner,
		todoBuilder({
			id: testTodoId(identity),
			userId: owner.userId,
			projectId: project.id,
			title: 'Original task'
		})
	);
	await repository.softDelete(owner, task.id, now);
	return { owner, repository, task };
};

it('does not return a deleted task through its identity', async () => {
	const { owner, repository, task } = await setup('14801', 14801);
	expect(await repository.findById(owner, task.id)).toBeUndefined();
});

it('rejects a stale edit without restoring a deleted task', async () => {
	const { owner, repository, task } = await setup('14802', 14802);
	const outcome = await repository.update(owner, { ...task, title: 'Late edit' }).then(
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
	const { owner, repository, task } = await setup('14803', 14803);
	expect(await repository.findForUpdate(owner, task.id)).toBeUndefined();
});
