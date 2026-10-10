import type { DateTime } from '$lib/models/workspace';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	projectBuilder,
	testActor,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';

it('returns only projects inside the inclusive creation range', async () => {
	const repository = new InMemoryProjectRepository();
	repository.projects = [1, 2, 3, 4].map((day) =>
		projectBuilder({
			id: testProjectId(day),
			name: `Project ${day}`,
			createdAt: `2026-10-0${day}T12:00:00.000Z` as DateTime
		})
	);
	const services = createProjectServices(repository, repository);
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			...agentToolResultsFixture(),
			projectLister: services.lister
		})
	);
	expect(
		await controller.agentListProjects(testActor(), {
			createdAfter: '2026-10-02T12:00:00.000Z' as DateTime,
			createdBefore: '2026-10-03T12:00:00.000Z' as DateTime
		})
	).toEqual({
		projects: [
			{ id: testProjectId(2), name: 'Project 2', createdAt: '2026-10-02T12:00:00.000Z' },
			{ id: testProjectId(3), name: 'Project 3', createdAt: '2026-10-03T12:00:00.000Z' }
		]
	});
});
