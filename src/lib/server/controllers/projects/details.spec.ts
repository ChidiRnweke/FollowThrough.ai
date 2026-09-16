import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { projectBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const repository = new InMemoryProjectRepository();
	repository.projects = [projectBuilder()];
	const catalog = new ProjectCatalog(repository, repository);
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			projectCreator: catalog,
			projectReader: catalog,
			projectTreeReader: catalog
		})
	);
	return { repository, controller };
};

describe('Project detail preparation', () => {
	it('normalizes a project name at the domain boundary', async () => {
		const { controller } = setup();
		const { project } = await controller.create(testActor(), { name: '  Migration  ' });
		expect(project.name).toBe('Migration');
	});

	it('rejects a blank project name before persistence', async () => {
		const { controller } = setup();
		await expect(controller.create(testActor(), { name: '   ' })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});
