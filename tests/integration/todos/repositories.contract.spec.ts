import { describe, expect, it } from 'vitest';
import type { TodoId } from '$lib/models/todos';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { actor, context, now, seedNote } from '../database-harness';
describe('Postgres todo repository invariants', () => {
	it('does not reveal a todo to another actor', async () => {
		const { owner, project } = await seedNote('21');
		const repository = new TodoRecords(context.db);
		const todo = {
			id: '50000000-0000-4000-8000-000000000021' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Private task',
			status: 'open' as const,
			responsibility: 'mine' as const,
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, todo);
		expect(await repository.findById(actor('22'), todo.id)).toBeUndefined();
	});
	it('makes a status update visible through filtered listing', async () => {
		const { owner, project } = await seedNote('45');
		const repository = new TodoRecords(context.db);
		const todo = await repository.insert(owner, {
			id: '50000000-0000-4000-8000-000000000045' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Status task',
			status: 'open',
			responsibility: 'mine',
			createdAt: now,
			updatedAt: now
		});
		await repository.update(owner, { ...todo, status: 'done' });
		expect((await repository.list(owner, { status: 'done' })).map((item) => item.id)).toEqual([
			todo.id
		]);
	});
	it('hides todos from an archived project', async () => {
		const { owner, project } = await seedNote('46');
		const repository = new TodoRecords(context.db);
		await repository.insert(owner, {
			id: '50000000-0000-4000-8000-000000000046' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Archived task',
			status: 'open',
			responsibility: 'mine',
			createdAt: now,
			updatedAt: now
		});
		await new ProjectRecords(context.db).archive(owner, project.id);
		expect(await repository.list(owner, {})).toEqual([]);
	});
	it('filters todos by category', async () => {
		const { owner, project } = await seedNote('51');
		const repository = new TodoRecords(context.db);
		const base = {
			userId: owner.userId,
			projectId: project.id,
			status: 'open' as const,
			responsibility: 'mine' as const,
			createdAt: now,
			updatedAt: now
		};
		const match = await repository.insert(owner, {
			...base,
			id: '50000000-0000-4000-8000-000000000051' as TodoId,
			title: 'Client task',
			category: 'Client work'
		});
		await repository.insert(owner, {
			...base,
			id: '50000000-0000-4000-8000-000000000052' as TodoId,
			title: 'Release task',
			category: 'Release 2.0'
		});
		const listed = await repository.list(owner, { category: 'Client work' });
		expect(listed.map((item) => item.id)).toEqual([match.id]);
	});
	it('lists distinct sorted categories', async () => {
		const { owner, project } = await seedNote('53');
		const repository = new TodoRecords(context.db);
		const base = {
			userId: owner.userId,
			projectId: project.id,
			status: 'open' as const,
			responsibility: 'mine' as const,
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, {
			...base,
			id: '50000000-0000-4000-8000-000000000053' as TodoId,
			title: 'One',
			category: 'Release 2.0'
		});
		await repository.insert(owner, {
			...base,
			id: '50000000-0000-4000-8000-000000000054' as TodoId,
			title: 'Two',
			category: 'Client work'
		});
		await repository.insert(owner, {
			...base,
			id: '50000000-0000-4000-8000-000000000055' as TodoId,
			title: 'Three',
			category: 'Client work'
		});
		await repository.insert(owner, {
			...base,
			id: '50000000-0000-4000-8000-000000000056' as TodoId,
			title: 'Uncategorised'
		});
		expect(await repository.listCategories(owner)).toEqual(['Client work', 'Release 2.0']);
	});
	it('does not leak categories to another actor', async () => {
		const { owner, project } = await seedNote('57');
		const repository = new TodoRecords(context.db);
		await repository.insert(owner, {
			id: '50000000-0000-4000-8000-000000000057' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Private category task',
			category: 'Client work',
			status: 'open',
			responsibility: 'mine',
			createdAt: now,
			updatedAt: now
		});
		expect(await repository.listCategories(actor('58'))).toEqual([]);
	});
	it('persists a category set on update', async () => {
		const { owner, project } = await seedNote('59');
		const repository = new TodoRecords(context.db);
		const todo = await repository.insert(owner, {
			id: '50000000-0000-4000-8000-000000000059' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Categorised later',
			status: 'open',
			responsibility: 'mine',
			createdAt: now,
			updatedAt: now
		});
		await repository.update(owner, { ...todo, category: 'Client work' });
		expect((await repository.findById(owner, todo.id))?.category).toBe('Client work');
	});
	it('clears a category when the update omits it', async () => {
		const { owner, project } = await seedNote('60');
		const repository = new TodoRecords(context.db);
		const todo = await repository.insert(owner, {
			id: '50000000-0000-4000-8000-000000000060' as TodoId,
			userId: owner.userId,
			projectId: project.id,
			title: 'Decategorised',
			category: 'Client work',
			status: 'open',
			responsibility: 'mine',
			createdAt: now,
			updatedAt: now
		});
		const { category: _cleared, ...withoutCategory } = todo;
		await repository.update(owner, withoutCategory);
		expect((await repository.findById(owner, todo.id))?.category).toBeUndefined();
	});
});
