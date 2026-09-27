import { expect, it } from 'vitest';
import { Projects, type ProjectsDependencies } from './controller';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
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
	const catalog = new ProjectCatalog(repository, repository);
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			projectReader: catalog,
			projectTreeReader: catalog,
			entryWriter: catalog,
			transactionRunner: new InMemoryTransactionRunner([repository])
		})
	);
	const skill = noteBuilder({ kind: 'skill', title: 'Hidden instructions', position: 0 });
	const first = noteBuilder({ id: testNoteId(2), title: 'First note', position: 1 });
	const second = noteBuilder({ id: testNoteId(3), title: 'Second note', position: 2 });
	repository.entries = [skill, first, second];
	return { repository, controller, skill, first, second };
};
it('reorders a note by the visible tree position when skills precede its siblings', async () => {
	const { controller, first, second } = setup();
	await controller.move(testActor(), {
		projectId: first.projectId,
		entryId: first.id,
		position: 1
	});
	expect(
		(await controller.get(testActor(), { projectId: first.projectId })).tree.map(
			(node) => node.entry.id
		)
	).toEqual([second.id, first.id]);
});
it('appends after visible siblings when hidden skills occupy the destination', async () => {
	const { repository, controller, first, second } = setup();
	const folder = noteBuilder({
		id: testNoteId(4),
		kind: 'folder',
		title: 'Folder',
		position: 3,
		document: { type: 'doc', content: [] },
		plainText: ''
	});
	repository.entries = [
		...repository.entries.map((note) =>
			note.id === first.id ? { ...note, parentId: folder.id, position: 0 } : note
		),
		folder
	];
	await controller.move(testActor(), {
		projectId: first.projectId,
		entryId: first.id,
		position: 2
	});
	expect(
		(await controller.get(testActor(), { projectId: first.projectId })).tree.map(
			(node) => node.entry.id
		)
	).toEqual([second.id, folder.id, first.id]);
});
it('preserves hidden skill records while reordering the visible tree', async () => {
	const { repository, controller, skill, first } = setup();
	await controller.move(testActor(), {
		projectId: first.projectId,
		entryId: first.id,
		position: 1
	});
	expect(repository.entries.find((entry) => entry.id === skill.id)).toEqual(skill);
});
it('keeps the existing full-sibling position semantics for a direct skill move', async () => {
	const { repository, controller, skill } = setup();
	await controller.move(testActor(), {
		projectId: skill.projectId,
		entryId: skill.id,
		position: 2
	});
	expect(repository.entries.find((entry) => entry.id === skill.id)?.position).toBe(2);
});
it('places a visible entry before the requested sibling despite interleaved skills', async () => {
	const { repository, controller, skill, first, second } = setup();
	repository.entries = [{ ...first, position: 0 }, { ...skill, position: 1 }, second];
	await controller.move(testActor(), {
		projectId: first.projectId,
		entryId: second.id,
		position: 0
	});
	expect(
		(await controller.get(testActor(), { projectId: first.projectId })).tree.map(
			(node) => node.entry.id
		)
	).toEqual([second.id, first.id]);
});
