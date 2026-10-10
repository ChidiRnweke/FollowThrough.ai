import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
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
	const catalog = createProjectServices(repository, repository);
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projectLifecycle: catalog.lifecycle,
			projectCreator: catalog.creator,
			projectReader: catalog.reader,
			projectTreeReader: catalog.treeReader
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

	it('omits root and nested skill documents from project trees', async () => {
		const { repository, controller } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(1) }),
			noteBuilder({ id: testNoteId(3), kind: 'skill', parentId: testNoteId(1) }),
			noteBuilder({ id: testNoteId(4), kind: 'skill' })
		];
		const { tree } = await controller.get(testActor(), { projectId: projectBuilder().id });
		expect(
			tree.map((node) => ({
				id: node.entry.id,
				children: node.children.map((child) => child.entry.id)
			}))
		).toEqual([{ id: testNoteId(1), children: [testNoteId(2)] }]);
	});
});
