import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { createSkillsCapability } from '$lib/server/factories/capabilities/skills-capability-factory';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectDetailService } from '$lib/services/projects/details';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { expect, it } from 'vitest';
import { context, seedUser } from '../database-harness';

const setup = async (suffix: string) => {
	const owner = await seedUser(suffix);
	const tx = createTransactionContext(context.db);
	const records = new ProjectRecords(tx.database);
	const notes = new NoteRecords(tx.database);
	const { builtIns } = createSkillsCapability({
		db: tx.database,
		projects: records,
		notes,
		provenance: new ProvenanceRecords(tx.database)
	});
	await tx.transactionRunner.run(() => builtIns.ensure(owner));
	const skill = (await notes.findByBuiltInKey(owner, 'followthrough'))!;
	const projectId = skill.projectId;
	const catalog = createProjectServices(records, records);
	const projects = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			...agentToolResultsFixture(),
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			placement: catalog.placement,
			projectLifecycle: catalog.lifecycle,
			projectReader: catalog.reader,
			projectTreeReader: catalog.treeReader,
			entryWriter: catalog.treeWriter,
			transactionRunner: tx.transactionRunner
		})
	);
	const creation = noteCreationControllers(
		createNoteServices(notes, new SourceAnchorRecords(tx.database), records).creator,
		tx.transactionRunner
	);
	return { owner, projectId, skill, projects, creation, records };
};
it('persists the visible reorder in an Inbox containing built-in skills', async () => {
	const { owner, projectId, projects, creation } = await setup('31001');
	const { note: first } = await creation.notes.create(owner, { projectId, title: 'First' });
	const { note: second } = await creation.notes.create(owner, { projectId, title: 'Second' });
	await projects.move(owner, { projectId, entryId: first.id, position: 1 });
	expect((await projects.get(owner, { projectId })).tree.map((node) => node.entry.id)).toEqual([
		second.id,
		first.id
	]);
});
it('appends a moved child after the visible root siblings instead of between hidden skills', async () => {
	const { owner, projectId, projects, creation } = await setup('31002');
	const { folder } = await creation.projects.createFolder(owner, { projectId, name: 'Folder' });
	const { note: first } = await creation.notes.create(owner, {
		projectId,
		parentId: folder.id,
		title: 'Moved child'
	});
	const { note: second } = await creation.notes.create(owner, { projectId, title: 'Root note' });
	await projects.move(owner, { projectId, entryId: first.id, position: 2 });
	expect((await projects.get(owner, { projectId })).tree.map((node) => node.entry.id)).toEqual([
		folder.id,
		second.id,
		first.id
	]);
});
it('uses visible sibling positions inside folders while retaining skill identities', async () => {
	const { owner, projectId, skill, projects, creation, records } = await setup('31003');
	const { folder } = await creation.projects.createFolder(owner, { projectId, name: 'Folder' });
	await projects.move(owner, { projectId, entryId: skill.id, parentId: folder.id, position: 0 });
	const { note: first } = await creation.notes.create(owner, {
		projectId,
		parentId: folder.id,
		title: 'First'
	});
	const { note: second } = await creation.notes.create(owner, {
		projectId,
		parentId: folder.id,
		title: 'Second'
	});
	const skillsBefore = (await records.list(owner, projectId))
		.filter((note) => note.kind === 'skill')
		.map((note) => note.id)
		.sort();
	await projects.move(owner, { projectId, entryId: first.id, parentId: folder.id, position: 1 });
	const result = await projects.get(owner, { projectId });
	expect({
		visible: result.tree
			.find((node) => node.entry.id === folder.id)
			?.children.map((node) => node.entry.id),
		skills: (await records.list(owner, projectId))
			.filter((note) => note.kind === 'skill')
			.map((note) => note.id)
			.sort()
	}).toEqual({ visible: [second.id, first.id], skills: skillsBefore });
});
