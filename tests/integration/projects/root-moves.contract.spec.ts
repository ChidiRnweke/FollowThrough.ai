import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { seedUser, context } from '../database-harness';

it('keeps a folder at the project root after reloading a completed move', async () => {
	const owner = await seedUser('13901');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const repository = new ProjectRecords(database);
	const catalog = createProjectServices(repository, repository);
	const project = await repository.insert(owner, { name: 'Root folder move' });
	const creation = noteCreationControllers(
		new NoteCatalog(new NoteRecords(database), new SourceAnchorRecords(database), repository),
		transactionRunner
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
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projectLifecycle: catalog.lifecycle,
			projectReader: catalog.reader,
			projectTreeReader: catalog.treeReader,
			entryWriter: catalog.treeWriter,
			transactionRunner
		})
	);
	await controller.move(owner, { projectId: project.id, entryId: child.id, position: 0 });
	const reloaded = await controller.get(owner, { projectId: project.id });
	expect(reloaded.tree.map(({ entry }) => entry.id)).toEqual([child.id, parent.id]);
});

it('restores a note at the root when its previous folder is archived', async () => {
	const owner = await seedUser('13902');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const projects = new ProjectRecords(database);
	const project = await projects.insert(owner, { name: 'Restore at root' });
	const repository = new NoteRecords(database);
	const catalog = new NoteCatalog(repository, new SourceAnchorRecords(database), projects);
	const creation = noteCreationControllers(catalog, transactionRunner);
	const { folder: parent } = await creation.projects.createFolder(owner, {
		projectId: project.id,
		name: 'Archived parent'
	});
	const { note } = await creation.notes.create(owner, {
		projectId: project.id,
		parentId: parent.id,
		title: 'Restored child'
	});
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			suggestionPresentation: new SuggestionPresentationService(),
			noteTrash: catalog,
			noteIndexer: new InMemoryNoteContent(),
			transactionRunner
		})
	);
	await controller.archive(owner, { noteId: note.id });
	await controller.archive(owner, { noteId: parent.id });
	await controller.restore(owner, { noteId: note.id });
	expect(await repository.findById(owner, note.id)).toMatchObject({
		parentId: undefined,
		archivedAt: undefined
	});
});
