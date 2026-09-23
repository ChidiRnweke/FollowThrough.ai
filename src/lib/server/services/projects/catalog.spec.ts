import { describe, expect, it } from 'vitest';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { projectBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { ProjectCatalog } from './catalog';

const setup = () => {
	const repository = new InMemoryProjectRepository();
	repository.projects = [projectBuilder()];
	return { repository, service: new ProjectCatalog(repository, repository) };
};

describe('Project management invariants', () => {
	it('hides a project tree after the project is archived', async () => {
		const { service } = setup();
		await service.archive(testActor(), projectBuilder().id);
		await expect(service.readEntries(testActor(), projectBuilder().id)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('allows an archived project name to be reused', async () => {
		const { service } = setup();
		await service.archive(testActor(), projectBuilder().id);
		const replacement = await service.create(testActor(), {
			name: projectBuilder().name,
			description: undefined
		});
		expect(replacement.name).toBe(projectBuilder().name);
	});

	it('rejects renaming to another active project name', async () => {
		const { service } = setup();
		await service.create(testActor(), { name: 'Other', description: undefined });
		await expect(
			service.rename(testActor(), {
				projectId: projectBuilder().id,
				name: 'other',
				description: undefined
			})
		).rejects.toMatchObject({ code: 'CONFLICT' });
	});
});
