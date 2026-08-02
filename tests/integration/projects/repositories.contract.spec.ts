import { describe, expect, it } from 'vitest';
import { ConflictError } from '$lib/errors';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context } from '../database-harness';
describe('Postgres project repository invariants', () => {
	it('does not reveal a project to another actor', async () => {
		const owner = actor('1');
		const repository = new ProjectRecords(context.db);
		const project = await repository.insert(owner, { name: 'Private project' });
		expect(await repository.findById(actor('2'), project.id)).toBeUndefined();
	});
	it('hides an archived project from active lookup', async () => {
		const owner = actor('3');
		const repository = new ProjectRecords(context.db);
		const project = await repository.insert(owner, { name: 'Archived project' });
		await repository.archive(owner, project.id);
		expect(await repository.findById(owner, project.id)).toBeUndefined();
	});
	it('allows an archived project name to be reused', async () => {
		const owner = actor('4');
		const repository = new ProjectRecords(context.db);
		const project = await repository.insert(owner, { name: 'Reusable' });
		await repository.archive(owner, project.id);
		const replacement = await repository.insert(owner, { name: 'reusable' });
		expect(replacement.name).toBe('reusable');
	});
	it('rejects a second active project whose name differs only in case', async () => {
		const owner = actor('401');
		const repository = new ProjectRecords(context.db);
		await repository.insert(owner, { name: 'Argenx' });
		await expect(repository.insert(owner, { name: 'argenx' })).rejects.toThrow(ConflictError);
	});
	it('rejects renaming a project onto another active project name', async () => {
		const owner = actor('402');
		const repository = new ProjectRecords(context.db);
		await repository.insert(owner, { name: 'Taken name' });
		const other = await repository.insert(owner, { name: 'Free name' });
		await expect(
			repository.update(owner, { projectId: other.id, name: 'taken name' })
		).rejects.toThrow(ConflictError);
	});
	it('allows the same project name for a different actor', async () => {
		const repository = new ProjectRecords(context.db);
		await repository.insert(actor('403'), { name: 'Shared name' });
		const other = await repository.insert(actor('404'), { name: 'Shared name' });
		expect(other.name).toBe('Shared name');
	});
});
