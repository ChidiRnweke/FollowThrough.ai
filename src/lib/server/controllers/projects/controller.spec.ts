import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectRules } from '$lib/services/projects/rules';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';

const setup = () => {
	const projects = new InMemoryProjectRepository(testActor());
	const catalog = createProjectServices(testActor(), projects, projects);
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			...agentToolResultsFixture(),
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectRules(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projects: catalog.catalog,
			transactionRunner: new InMemoryTransactionRunner([])
		})
	);
	return { projects, controller };
};

describe('Project naming invariants', () => {
	it('rejects an empty project name', async () => {
		const { controller } = setup();
		await expect(controller.create({ name: '   ' })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});

describe('Project filesystem invariants', () => {
	it('keeps sibling order independent of update time', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		projects.entries = [
			noteBuilder({ id: testNoteId(), position: 1, updatedAt: '2030-01-01T00:00:00Z' as never }),
			noteBuilder({ id: testNoteId(2), position: 0 })
		];
		const result = await controller.get({ projectId: testProjectId() });
		expect(result.tree.map((node) => node.entry.id)).toEqual([testNoteId(2), testNoteId()]);
	});

	it('rejects a cross-project parent', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder(), projectBuilder({ id: testProjectId(2) })];
		projects.entries = [
			noteBuilder({ id: testNoteId() }),
			noteBuilder({ id: testNoteId(2), projectId: testProjectId(2), kind: 'folder' })
		];
		await expect(
			controller.move({
				projectId: testProjectId(),
				entryId: testNoteId(),
				parentId: testNoteId(2),
				position: 0
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
