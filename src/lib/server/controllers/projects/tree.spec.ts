import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const repository = new InMemoryProjectRepository();
	repository.projects = [projectBuilder()];
	const catalog = new ProjectCatalog(repository, repository);
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			projectCreator: catalog,
			projectReader: catalog,
			projectTreeReader: catalog
		})
	);
	return { repository, controller };
};

describe('Project tree presentation', () => {
	it('assembles nested entries into a recursive tree', async () => {
		const { repository, controller } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(1) })
		];
		const { tree } = await controller.get(testActor(), { projectId: projectBuilder().id });
		expect(tree[0]?.children[0]?.entry.id).toBe(testNoteId(2));
	});

	it('does not expose root skill documents in project trees', async () => {
		const { repository, controller } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1) }),
			noteBuilder({ id: testNoteId(2), kind: 'skill' })
		];
		const { tree } = await controller.get(testActor(), { projectId: projectBuilder().id });
		expect(tree.map((node) => node.entry.id)).toEqual([testNoteId(1)]);
	});

	it('does not expose nested skill documents in project trees', async () => {
		const { repository, controller } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(1) }),
			noteBuilder({ id: testNoteId(3), kind: 'skill', parentId: testNoteId(1) })
		];
		const { tree } = await controller.get(testActor(), { projectId: projectBuilder().id });
		expect(tree[0]?.children.map((node) => node.entry.id)).toEqual([testNoteId(2)]);
	});
});
