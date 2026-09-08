import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	projectBuilder,
	testActor,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const projects = new InMemoryProjects();
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			projectCreator: projects,
			projectReader: projects,
			projectLister: projects,
			projectEditor: projects,
			projectTreeReader: projects,
			folderCreator: projects,
			entryMover: projects,
			transactionRunner: new InMemoryTransactionRunner([])
		})
	);
	return { projects, controller };
};

describe('Project section-numbering default', () => {
	it('stores the chosen default', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		const output = await controller.setSectionNumberingDefault(testActor(), {
			projectId: testProjectId(),
			enabled: true
		});
		expect(output.project.sectionNumberingDefault).toBe(true);
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
