import { initialSyncCursor } from '$lib/models/sync';
import { Skills, type SkillsDependencies } from '$lib/server/controllers/skills/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSkillServices } from '$lib/server/factories/capabilities/skills-capability-factory';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { workspacePullFixture } from '$lib/testing/workspace/fixtures/sync-pull';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NoteReferenceService } from '$lib/services/notes/references';
import { SkillPortabilityService } from '$lib/services/skills/manifest';
import { SkillMetadataEditingService } from '$lib/services/skills/metadata';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { saveNoteDraft } from '$lib/testing/notes/fixtures/saved-draft';
import { storedNote } from '$lib/testing/notes/fixtures/stored-note';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { describe, expect, it } from 'vitest';
import { context, seedNote } from '../database-harness';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();

const setup = async (suffix: string) => {
	const { owner, project } = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const { services: catalog } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const records = new SkillRecords(database);
	const library = createSkillServices(
		records,
		new NoteRecords(database),
		new ProvenanceRecords(database)
	);
	const content = new InMemoryNoteContent();
	const controller = new Skills(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<SkillsDependencies>({
			...agentToolResultsFixture(),
			skillPortability: new SkillPortabilityService(),
			skillMetadataEditing: new SkillMetadataEditingService(),
			noteReferences: new NoteReferenceService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			transactionRunner,
			skillEditor: library.editor,
			skillFinder: library.finder,
			skillUsageLister: library.usageLister,
			noteEditor: catalog.editor,
			anchorRepairer: content,
			noteLinkReconciler: content,
			noteIndexer: content
		})
	);
	const note = await storedNote(catalog.creator, owner, {
		kind: 'skill',
		projectId: project.id,
		title: 'Release checklist'
	});
	await records.insert(owner, {
		note,
		slug: 'release-checklist',
		description: 'Release instructions',
		triggerHints: [],
		metadata: {},
		allowImplicitInvocation: true,
		isEnabled: true
	});
	return {
		owner,
		note,
		catalog,
		records,
		controller,
		transactionRunner,
		workspace: workspacePullFixture(database)
	};
};

describe('Skill display name authority', () => {
	it('renames the note through a legacy display-name command', async () => {
		const { owner, note, controller, records } = await setup('12201');
		await controller.update(owner, { noteId: note.id, displayName: 'Ship checklist' });
		expect((await records.findByNoteId(owner, note.id))?.note.title).toBe('Ship checklist');
	});
	it('publishes the renamed skill and note resources with the derived database name', async () => {
		const { owner, note, catalog, workspace, transactionRunner } = await setup('12202');
		const initial = await workspace.pullChangePage(owner, initialSyncCursor);
		await saveNoteDraft(catalog.editor, transactionRunner, owner, {
			...note,
			title: 'Ship checklist'
		});
		const batch = await workspace.pullChangePage(owner, initial.cursor);
		expect({
			resources: batch.records,
			storedName: await context.client`select name from skills where note_id = ${note.id}`
		}).toEqual({
			resources: expect.arrayContaining([
				{
					key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
					resource: expect.objectContaining({ kind: 'found' })
				},
				{
					key: workspaceResourceKey({ type: 'skills', id: [note.id] }),
					resource: expect.objectContaining({ kind: 'found' })
				}
			]),
			storedName: [{ name: 'Ship checklist' }]
		});
	});
	it('prevents a metadata writer from changing the derived display name', async () => {
		const { note } = await setup('12204');
		await context.client`update skills set name = 'Independent name' where note_id = ${note.id}`;
		expect(await context.client`select name from skills where note_id = ${note.id}`).toEqual([
			{ name: note.title }
		]);
	});
	it('rolls back both sync resources with a rejected rename', async () => {
		const { owner, note, catalog, transactionRunner, workspace } = await setup('12206');
		const initial = await workspace.pullChangePage(owner, initialSyncCursor);
		await transactionRunner
			.run(async () => {
				await saveNoteDraft(catalog.editor, transactionRunner, owner, {
					...note,
					title: 'Ship checklist'
				});
				throw new Error('Reject rename');
			})
			.catch(() => ({ kind: 'failure' }));
		expect({
			batch: await workspace.pullChangePage(owner, initial.cursor),
			projection:
				await context.client`select notes.title, skills.name from notes join skills on skills.note_id = notes.id where notes.id = ${note.id}`
		}).toEqual({
			batch: { cursor: initial.cursor, records: [], hasMore: false },
			projection: [{ title: note.title, name: note.title }]
		});
	});
});
