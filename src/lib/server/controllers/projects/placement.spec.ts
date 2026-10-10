import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { describe, expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
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
	return {
		repository,
		controller: new Projects(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<ProjectsDependencies>({
				noteCreationRules: new NoteLifecycleRulesService(),
				details: new ProjectDetailService(),
				presentation: new ProjectTreePresentationService(),
				placement: catalog.placement,
				projectLifecycle: catalog.lifecycle,
				entryWriter: catalog.treeWriter,
				transactionRunner: new InMemoryTransactionRunner([repository])
			})
		)
	};
};

describe('Project placement', () => {
	it('rejects moving an entry below its descendant', async () => {
		const { repository, controller } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), kind: 'folder', parentId: testNoteId(1) })
		];
		await expect(
			controller.move(testActor(), {
				projectId: projectBuilder().id,
				entryId: testNoteId(1),
				parentId: testNoteId(2),
				position: 0
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('closes the ordering gap after a cross-folder move', async () => {
		const { repository, controller } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder', position: 0 }),
			noteBuilder({ id: testNoteId(2), position: 1 }),
			noteBuilder({ id: testNoteId(3), kind: 'folder', position: 2 })
		];
		await controller.move(testActor(), {
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
		const { repository, controller } = setup();
		repository.entries = [
			noteBuilder({ id: testNoteId(1), kind: 'folder' }),
			noteBuilder({ id: testNoteId(2), parentId: testNoteId(1) }),
			noteBuilder({ id: testNoteId(3), kind: 'folder' })
		];
		await controller.move(testActor(), {
			projectId: projectBuilder().id,
			entryId: testNoteId(1),
			parentId: testNoteId(3),
			position: 0
		});
		expect(repository.entries.find((entry) => entry.id === testNoteId(2))?.parentId).toBe(
			testNoteId(1)
		);
	});
});
