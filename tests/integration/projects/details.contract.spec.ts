import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
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
	const catalog = createProjectServices(repository, repository);
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projectLifecycle: catalog.lifecycle,
			projectEditor: catalog.editor
		})
	);
	await controller.rename(owner, { projectId: project.id, name: ' Renamed ', description });
	const saved = await repository.findById(owner, project.id);
	expect({ name: saved?.name, description: saved?.description }).toEqual({
		name: 'Renamed',
		description: expected
	});
});
