import { expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { seedUser, context } from '../database-harness';

it.each([
	{
		suffix: '14001',
		case: 'clears an explicitly empty description',
		description: ' ',
		expected: undefined
	},
	{
		suffix: '23401',
		case: 'retains an omitted description during rename',
		description: undefined,
		expected: 'Keep this context'
	},
	{
		suffix: '23402',
		case: 'replaces an explicitly supplied description',
		description: ' New context ',
		expected: 'New context'
	}
])('$case', async ({ suffix, description, expected }) => {
	const owner = await seedUser(suffix);
	const repository = new ProjectRecords(context.db);
	const project = await repository.insert(owner, {
		name: 'Project details',
		description: 'Keep this context'
	});
	const catalog = new ProjectCatalog(repository, repository);
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({ projectEditor: catalog })
	);
	await controller.rename(owner, { projectId: project.id, name: ' Renamed ', description });
	const saved = await repository.findById(owner, project.id);
	expect({ name: saved?.name, description: saved?.description }).toEqual({
		name: 'Renamed',
		description: expected
	});
});
