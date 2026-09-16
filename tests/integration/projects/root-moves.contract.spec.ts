import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context } from '../database-harness';

it('keeps a folder at the project root after reloading a completed move', async () => {
	const owner = actor('13901');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const repository = new ProjectRecords(database);
	const catalog = new ProjectCatalog(repository, repository);
	const project = await repository.insert(owner, { name: 'Root folder move' });
	const creation = noteCreationControllers(
		new NoteCatalog(new NoteRecords(database), new SourceAnchorRecords(database), repository)
	);
	const { folder: parent } = await creation.projects.createFolder(owner, {
		projectId: project.id,
		name: 'Parent'
	});
	const { folder: child } = await creation.projects.createFolder(owner, {
		projectId: project.id,
		parentId: parent.id,
		name: 'Child'
	});
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			projectReader: catalog,
			projectTreeReader: catalog,
			entryMover: catalog,
			transactionRunner
		})
	);
	await controller.move(owner, { projectId: project.id, entryId: child.id, position: 0 });
	const reloaded = await controller.get(owner, { projectId: project.id });
	expect(reloaded.tree.map(({ entry }) => entry.id)).toEqual([child.id, parent.id]);
});

it('restores a note at the root when its previous folder is archived', async () => {
	const owner = actor('13902');
	const projects = new ProjectRecords(context.db);
	const project = await projects.insert(owner, { name: 'Restore at root' });
	const repository = new NoteRecords(context.db);
	const catalog = new NoteCatalog(repository, new SourceAnchorRecords(context.db), projects);
	const creation = noteCreationControllers(catalog);
	const { folder: parent } = await creation.projects.createFolder(owner, {
		projectId: project.id,
		name: 'Archived parent'
	});
	const { note } = await creation.notes.create(owner, {
		projectId: project.id,
		parentId: parent.id,
		title: 'Restored child'
	});
	await catalog.archive(owner, note.id);
	await catalog.archive(owner, parent.id);
	await catalog.restore(owner, note.id);
	expect(await repository.findById(owner, note.id)).toMatchObject({
		parentId: undefined,
		archivedAt: undefined
	});
});
