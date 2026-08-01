import { describe, expect, it } from 'vitest';
import { Projects } from './controller';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const projects = new InMemoryProjects();
	const controller = new Projects({
		projectCreator: projects,
		projectReader: projects,
		projectLister: projects,
		projectEditor: projects,
		projectTreeReader: projects,
		folderCreator: projects,
		entryMover: projects,
		transactionRunner: new InMemoryTransactionRunner([])
	});
	return { projects, controller };
};

describe('Project ownership invariants', () => {
	it('lists only projects owned by the actor', async () => {
		const { projects, controller } = setup();
		projects.projects = [
			projectBuilder(),
			projectBuilder({ id: testProjectId(2), userId: testActor(2).userId })
		];
		const result = await controller.list(testActor());
		expect(result.projects.map((project) => project.id)).toEqual([testProjectId()]);
	});

	it('does not reveal a foreign project by id', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		await expect(
			controller.get(testActor(2), { projectId: testProjectId() })
		).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

describe('Project naming invariants', () => {
	it('trims a new project name', async () => {
		const { controller } = setup();
		const result = await controller.create(testActor(), { name: '  Platform  ' });
		expect(result.project.name).toBe('Platform');
	});

	it('rejects an empty project name', async () => {
		const { controller } = setup();
		await expect(controller.create(testActor(), { name: '   ' })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('rejects a duplicate active project name case-insensitively', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder({ name: 'Platform' })];
		await expect(controller.create(testActor(), { name: 'platform' })).rejects.toMatchObject({
			code: 'CONFLICT'
		});
	});

	it('excludes an archived project from active lists', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		await controller.archive(testActor(), { projectId: testProjectId() });
		const result = await controller.list(testActor());
		expect(result.projects).toEqual([]);
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

	it('creates an empty folder under another folder', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		projects.entries = [noteBuilder({ id: testNoteId(), kind: 'folder' })];
		const result = await controller.createFolder(testActor(), {
			projectId: testProjectId(),
			parentId: testNoteId(),
			name: 'Decisions'
		});
		expect(result.folder.kind).toBe('folder');
	});

	it('rejects a document as a parent', async () => {
		const { projects, controller } = setup();
		projects.projects = [projectBuilder()];
		projects.entries = [noteBuilder({ id: testNoteId(), kind: 'note' })];
		await expect(
			controller.createFolder(testActor(), {
				projectId: testProjectId(),
				parentId: testNoteId(),
				name: 'Decisions'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
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
