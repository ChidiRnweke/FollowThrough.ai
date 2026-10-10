import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { ProjectDetailService } from '$lib/services/projects/details';
import { expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { treeControllers } from '../project-tree-harness';
import { seedUser, actor, context } from '../database-harness';

const setup = () => {
	const repository = new ProjectRecords(context.db);
	const catalog = createProjectServices(repository, repository);
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projectLifecycle: catalog.lifecycle,
			projectCreator: catalog.creator,
			projectReader: catalog.reader,
			projectLister: catalog.lister,
			projectTreeReader: catalog.treeReader,
			projectEditor: catalog.editor
		})
	);
	return { repository, controller };
};
it('creates a normalized ordinary project that can be reopened', async () => {
	const { controller } = setup();
	const owner = await seedUser('23801');
	const { project } = await controller.create(owner, {
		name: '  Research  ',
		description: '  Release context  '
	});
	expect(await controller.get(owner, { projectId: project.id })).toMatchObject({
		project: {
			id: project.id,
			name: 'Research',
			description: 'Release context',
			role: 'workspace'
		},
		tree: []
	});
});
it('lists only active projects owned by the actor', async () => {
	const { controller } = setup();
	const owner = await seedUser('23802');
	const active = await controller.create(owner, { name: 'Active' });
	const archived = await controller.create(owner, { name: 'Archived' });
	await controller.archive(owner, { projectId: archived.project.id });
	await controller.create(await seedUser('23803'), { name: 'Foreign' });
	expect((await controller.list(owner)).projects.map((project) => project.id)).toEqual([
		active.project.id
	]);
});
it('rejects a case-insensitive duplicate active project name', async () => {
	const { controller } = setup();
	const owner = await seedUser('23804');
	await controller.create(owner, { name: 'Research' });
	await expect(controller.create(owner, { name: 'research' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
});
it('allows reusing an archived name while keeping a distinct project identity', async () => {
	const { controller } = setup();
	const owner = await seedUser('23805');
	const original = await controller.create(owner, { name: 'Research' });
	await controller.archive(owner, { projectId: original.project.id });
	const replacement = await controller.create(owner, { name: 'Research' });
	expect(replacement.project.id).not.toBe(original.project.id);
});
it('does not open a project for another actor', async () => {
	const { controller } = setup();
	const owner = await seedUser('23806');
	const { project } = await controller.create(owner, { name: 'Private' });
	await expect(controller.get(actor('23807'), { projectId: project.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
it('persists a nested folder and returns it in the opened project tree', async () => {
	const { controller } = setup();
	const owner = await seedUser('23808');
	const { project } = await controller.create(owner, { name: 'Folders' });
	const transaction = createTransactionContext(context.db);
	const writer = treeControllers(transaction.database, transaction.transactionRunner).projects;
	const parent = await writer.createFolder(owner, { projectId: project.id, name: 'Parent' });
	const child = await writer.createFolder(owner, {
		projectId: project.id,
		parentId: parent.folder.id,
		name: '  Decisions  '
	});
	expect(
		(await controller.get(owner, { projectId: project.id })).tree[0]?.children[0]?.entry
	).toMatchObject({
		id: child.folder.id,
		parentId: parent.folder.id,
		title: 'Decisions',
		kind: 'folder',
		plainText: ''
	});
});
