import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import {
	projectBuilder,
	testActor,
	testProjectId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const projects = new InMemoryProjectRepository();
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			projectEditor: createProjectServices(projects, projects).editor
		})
	);
	return { projects, controller };
};

describe('Project section-numbering default', () => {
	it.each([true, false])('stores the explicit %s default', async (enabled) => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		const output = await controller.setSectionNumberingDefault(testActor(), {
			projectId: testProjectId(),
			enabled
		});
		expect(output.project.sectionNumberingDefault).toBe(enabled);
	});

	it('clears back to inheriting the app default', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder({ sectionNumberingDefault: false })];
		const output = await controller.setSectionNumberingDefault(testActor(), {
			projectId: testProjectId()
		});
		expect(output.project.sectionNumberingDefault).toBeUndefined();
	});

	it('rejects a project the actor does not own', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder({ userId: testActor(2).userId })];
		await expect(
			controller.setSectionNumberingDefault(testActor(), {
				projectId: testProjectId(),
				enabled: true
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});

it('rejects changing the default of an archived project', async () => {
	const { projects, controller } = setup();
	projects.projects = [projectBuilder({ archivedAt: testNow })];
	await expect(
		controller.setSectionNumberingDefault(testActor(), {
			projectId: testProjectId(),
			enabled: true
		})
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
