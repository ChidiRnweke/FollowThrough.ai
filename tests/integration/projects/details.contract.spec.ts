import { expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context } from '../database-harness';

it('clears a project description after saving an empty description', async () => {
	const owner = actor('14001');
	const repository = new ProjectRecords(context.db);
	const project = await repository.insert(owner, {
		name: 'Project details',
		description: 'Remove this description'
	});
	const catalog = new ProjectCatalog(repository, repository);
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({ projectEditor: catalog })
	);
	await controller.rename(owner, { projectId: project.id, name: project.name, description: ' ' });
	expect((await repository.findById(owner, project.id))?.description).toBeUndefined();
});
