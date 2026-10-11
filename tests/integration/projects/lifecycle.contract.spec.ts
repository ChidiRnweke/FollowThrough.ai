import type { ActorContext } from '$lib/models/identity';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectDetailService } from '$lib/services/projects/details';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { expect, it } from 'vitest';
import { actor, context, seedUser } from '../database-harness';
import { treeControllers } from '../project-tree-harness';

const setup = (actor: ActorContext) => {
	const repository = new ProjectRecords(actor, context.db);
	const catalog = createProjectServices(actor, repository, repository);
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			...agentToolResultsFixture(),
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
	const owner = await seedUser('23801');
	const { controller } = setup(owner);
	const { project } = await controller.create({
		name: '  Research  ',
		description: '  Release context  '
	});
	expect(await controller.get({ projectId: project.id })).toMatchObject({
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
	const owner = await seedUser('23802');
	const { controller } = setup(owner);
	const active = await controller.create({ name: 'Active' });
	const archived = await controller.create({ name: 'Archived' });
	await controller.archive({ projectId: archived.project.id });
	await setup(await seedUser('23803')).controller.create({ name: 'Foreign' });
	expect((await controller.list()).projects.map((project) => project.id)).toEqual([
		active.project.id
	]);
});
it('rejects a case-insensitive duplicate active project name', async () => {
	const owner = await seedUser('23804');
	const { controller } = setup(owner);
	await controller.create({ name: 'Research' });
	await expect(controller.create({ name: 'research' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
});
it('allows reusing an archived name while keeping a distinct project identity', async () => {
	const owner = await seedUser('23805');
	const { controller } = setup(owner);
	const original = await controller.create({ name: 'Research' });
	await controller.archive({ projectId: original.project.id });
	const replacement = await controller.create({ name: 'Research' });
	expect(replacement.project.id).not.toBe(original.project.id);
});
it('does not open a project for another actor', async () => {
	const owner = await seedUser('23806');
	const { controller } = setup(owner);
	const { project } = await controller.create({ name: 'Private' });
	await expect(
		setup(actor('23807')).controller.get({ projectId: project.id })
	).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
it('persists a nested folder and returns it in the opened project tree', async () => {
	const owner = await seedUser('23808');
	const { controller } = setup(owner);
	const { project } = await controller.create({ name: 'Folders' });
	const transaction = createTransactionContext(context.db);
	const writer = treeControllers(
		owner,
		transaction.database,
		transaction.transactionRunner
	).projects;
	const parent = await writer.createFolder({ projectId: project.id, name: 'Parent' });
	const child = await writer.createFolder({
		projectId: project.id,
		parentId: parent.folder.id,
		name: '  Decisions  '
	});
	expect(
		(await controller.get({ projectId: project.id })).tree[0]?.children[0]?.entry
	).toMatchObject({
		id: child.folder.id,
		parentId: parent.folder.id,
		title: 'Decisions',
		kind: 'folder',
		plainText: ''
	});
});
