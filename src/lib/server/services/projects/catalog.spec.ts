import { describe, expect, it } from 'vitest';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { projectBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';

const setup = () => {
	const repository = new InMemoryProjectRepository();
	repository.projects = [projectBuilder()];
	return { repository, service: createProjectServices(repository, repository) };
};

describe('Project management invariants', () => {
	it('hides a project tree after the project is archived', async () => {
		const { service } = setup();
		await service.lifecycle.archive(testActor(), projectBuilder().id);
		await expect(
			service.treeReader.readEntries(testActor(), projectBuilder().id)
		).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('allows an archived project name to be reused', async () => {
		const { service } = setup();
		await service.lifecycle.archive(testActor(), projectBuilder().id);
		const replacement = await service.creator.create(testActor(), {
			name: projectBuilder().name,
			description: undefined
		});
		expect(replacement.name).toBe(projectBuilder().name);
	});

	it('rejects renaming to another active project name', async () => {
		const { service } = setup();
		await service.creator.create(testActor(), { name: 'Other', description: undefined });
		await expect(
			service.editor.rename(testActor(), {
				projectId: projectBuilder().id,
				name: 'other',
				description: undefined
			})
		).rejects.toMatchObject({ code: 'CONFLICT' });
	});
});
