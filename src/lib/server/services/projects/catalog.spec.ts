import { describe, expect, it } from 'vitest';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { projectBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';

const setup = () => {
	const repository = new InMemoryProjectRepository(testActor());
	repository.projects = [projectBuilder()];
	return { repository, service: createProjectServices(testActor(), repository, repository) };
};

describe('Project management invariants', () => {
	it('hides a project tree after the project is archived', async () => {
		const { service } = setup();
		await service.catalog.archive(projectBuilder().id);
		await expect(service.catalog.readEntries(projectBuilder().id)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});
