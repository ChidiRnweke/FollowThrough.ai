import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const projects = new InMemoryProjectRepository();
	const catalog = createProjectServices(projects, projects);
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projectLifecycle: catalog.lifecycle,
			projectCreator: catalog.creator,
			projectReader: catalog.reader,
			projectLister: catalog.lister,
			projectEditor: catalog.editor,
			projectTreeReader: catalog.treeReader,
			entryWriter: catalog.treeWriter,
			transactionRunner: new InMemoryTransactionRunner([])
		})
	);
	return { projects, controller };
};

describe('Project naming invariants', () => {
	it('rejects an empty project name', async () => {
		const { controller } = setup();
		await expect(controller.create(testActor(), { name: '   ' })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});

describe('Project filesystem invariants', () => {
	it('returns nested entries below their folder', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		projects.entries = [
			noteBuilder({ id: testNoteId(), kind: 'folder', title: 'Discovery' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(), title: 'Workshop' })
		];
		const result = await controller.get(testActor(), { projectId: testProjectId() });
		expect(result.tree[0]?.children[0]?.entry.id).toBe(testNoteId(2));
	});

	it('keeps sibling order independent of update time', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		projects.entries = [
			noteBuilder({ id: testNoteId(), position: 1, updatedAt: '2030-01-01T00:00:00Z' as never }),
			noteBuilder({ id: testNoteId(2), position: 0 })
		];
		const result = await controller.get(testActor(), { projectId: testProjectId() });
		expect(result.tree.map((node) => node.entry.id)).toEqual([testNoteId(2), testNoteId()]);
	});

	it('rejects moving a folder below its descendant', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		projects.entries = [
			noteBuilder({ id: testNoteId(), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), kind: 'folder', parentId: testNoteId() })
		];
		await expect(
			controller.move(testActor(), {
				projectId: testProjectId(),
				entryId: testNoteId(),
				parentId: testNoteId(2),
				position: 0
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects a cross-project parent', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder(), projectBuilder({ id: testProjectId(2) })];
		projects.entries = [
			noteBuilder({ id: testNoteId() }),
			noteBuilder({ id: testNoteId(2), projectId: testProjectId(2), kind: 'folder' })
		];
		await expect(
			controller.move(testActor(), {
				projectId: testProjectId(),
				entryId: testNoteId(),
				parentId: testNoteId(2),
				position: 0
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('reorders target siblings and closes the source gap', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		projects.entries = [
			noteBuilder({ id: testNoteId(), position: 0 }),
			noteBuilder({ id: testNoteId(2), position: 1 }),
			noteBuilder({ id: testNoteId(3), position: 2 })
		];
		await controller.move(testActor(), {
			projectId: testProjectId(),
			entryId: testNoteId(3),
			position: 0
		});
		const result = await controller.get(testActor(), { projectId: testProjectId() });
		expect(result.tree.map((node) => node.entry.id)).toEqual([
			testNoteId(3),
			testNoteId(),
			testNoteId(2)
		]);
	});
});
