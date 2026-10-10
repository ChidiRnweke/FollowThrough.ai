import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectDetailService } from '$lib/services/projects/details';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { projectBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';

const setup = () => {
	const repository = new InMemoryProjectRepository();
	repository.projects = [projectBuilder()];
	const catalog = createProjectServices(repository, repository);
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			...agentToolResultsFixture(),
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projectLifecycle: catalog.lifecycle,
			projectCreator: catalog.creator,
			projectReader: catalog.reader,
			projectEditor: catalog.editor,
			projectTreeReader: catalog.treeReader
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
});

it.each([
	{ description: undefined, expected: 'Keep this context' },
	{ description: '  ', expected: undefined },
	{ description: '  New context  ', expected: 'New context' }
])(
	'respects omitted, cleared and replaced descriptions: $description',
	async ({ description, expected }) => {
		const { repository, controller } = setup();
		const original = projectBuilder({ description: 'Keep this context' });
		repository.projects = [original];
		const { project } = await controller.rename(testActor(), {
			projectId: original.id,
			name: '  Renamed  ',
			description
		});
		expect({
			name: project.name,
			description: project.description,
			stored: repository.projects[0]?.description
		}).toEqual({ name: 'Renamed', description: expected, stored: expected });
	}
);
