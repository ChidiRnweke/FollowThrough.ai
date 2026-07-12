import { describe, expect, it } from 'vitest';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId
} from '$lib/testing/fixtures/domain-builders';
import { ProjectManagementService } from './management';

const setup = () => {
	const repository = new InMemoryProjectRepository();
	repository.projects = [projectBuilder()];
	return { repository, service: new ProjectManagementService(repository, repository) };
};

describe('Project management invariants', () => {
	it('normalizes a project name at the domain boundary', async () => {
		const { service } = setup();
		const project = await service.create(testActor(), { name: '  Migration  ' });
		expect(project.name).toBe('Migration');
	});

	it('rejects a blank project name before persistence', async () => {
		const { service } = setup();
		await expect(service.create(testActor(), { name: '   ' })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('assembles nested entries into a recursive tree', async () => {
		const { repository, service } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(1) })
		];
		const tree = await service.read(testActor(), projectBuilder().id);
		expect(tree[0]?.children[0]?.entry.id).toBe(testNoteId(2));
	});

	it('rejects moving an entry below its descendant', async () => {
		const { repository, service } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), kind: 'folder', parentId: testNoteId(1) })
		];
		await expect(
			service.move(testActor(), {
				projectId: projectBuilder().id,
				entryId: testNoteId(1),
				parentId: testNoteId(2),
				position: 0
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('closes the ordering gap after a cross-folder move', async () => {
		const { repository, service } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder', position: 0 }),
			noteBuilder({ id: testNoteId(2), position: 1 }),
			noteBuilder({ id: testNoteId(3), kind: 'folder', position: 2 })
		];
		await service.move(testActor(), {
			projectId: projectBuilder().id,
			entryId: testNoteId(2),
			parentId: testNoteId(3),
			position: 0
		});
		expect(
			repository.entries
				.filter((entry) => entry.parentId === undefined)
				.sort((left, right) => left.position - right.position)
				.map((entry) => entry.position)
		).toEqual([0, 1]);
	});

	it('preserves a folder subtree when moving its root', async () => {
		const { repository, service } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(1) }),
			noteBuilder({ id: testNoteId(3), kind: 'folder' })
		];
		await service.move(testActor(), {
			projectId: projectBuilder().id,
			entryId: testNoteId(1),
			parentId: testNoteId(3),
			position: 0
		});
		expect(repository.entries.find((entry) => entry.id === testNoteId(2))?.parentId).toBe(
			testNoteId(1)
		);
	});

	it('rejects a note as a folder parent', async () => {
		const { repository, service } = setup();
		repository.entries = [noteBuilder({ id: testNoteId(2), kind: 'note' })];
		await expect(
			service.createFolder(testActor(), {
				projectId: projectBuilder().id,
				parentId: testNoteId(2),
				name: 'Nested'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('hides a project tree after the project is archived', async () => {
		const { service } = setup();
		await service.archive(testActor(), projectBuilder().id);
		await expect(service.read(testActor(), projectBuilder().id)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('allows an archived project name to be reused', async () => {
		const { service } = setup();
		await service.archive(testActor(), projectBuilder().id);
		const replacement = await service.create(testActor(), { name: projectBuilder().name });
		expect(replacement.name).toBe(projectBuilder().name);
	});

	it('rejects renaming to another active project name', async () => {
		const { service } = setup();
		await service.create(testActor(), { name: 'Other' });
		await expect(
			service.rename(testActor(), { projectId: projectBuilder().id, name: 'other' })
		).rejects.toMatchObject({ code: 'CONFLICT' });
	});
});
