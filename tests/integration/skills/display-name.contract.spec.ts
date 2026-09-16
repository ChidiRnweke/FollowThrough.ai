import { describe, expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from '$lib/server/controllers/skills/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { initialSyncCursor } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner, project } = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const { catalog } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const records = new SkillRecords(database);
	const library = new SkillLibrary(
		records,
		new NoteRecords(database),
		new ProvenanceRecords(database)
	);
	const content = new InMemoryNoteContent();
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			transactionRunner,
			skillEditor: library,
			skillFinder: library,
			skillUsageLister: library,
			noteEditor: catalog,
			anchorRepairer: content,
			noteLinkReconciler: content,
			noteIndexer: content
		})
	);
	const note = await catalog.create(owner, {
		documentKind: 'skill',
		projectId: project.id,
		title: 'Release checklist'
	});
	await records.insert(owner, {
		note,
		slug: 'release-checklist',
		description: 'Release instructions',
		triggerHints: [],
		isEnabled: true
	});
	return {
		owner,
		note,
		catalog,
		records,
		controller,
		transactionRunner,
		journal: new WorkspaceSyncChanges(database)
	};
};

describe('Skill display name authority', () => {
	it('renames the note through a legacy display-name command', async () => {
		const { owner, note, controller, records } = await setup('12201');
		await controller.update(owner, { noteId: note.id, displayName: 'Ship checklist' });
		expect((await records.findByNoteId(owner, note.id))?.note.title).toBe('Ship checklist');
	});
	it('publishes both sync resources when the note title changes', async () => {
		const { owner, note, catalog, journal } = await setup('12202');
		const initial = await journal.pullPage(owner, initialSyncCursor);
		await catalog.save(owner, { ...note, title: 'Ship checklist' });
		const batch = await journal.pullPage(owner, initial.cursor);
		expect(batch.records).toEqual(
			expect.arrayContaining([
				{
					key: workspaceResourceKey({ type: 'notes', id: [note.id] }),
					resource: expect.objectContaining({ kind: 'found' })
				},
				{
					key: workspaceResourceKey({ type: 'skills', id: [note.id] }),
					resource: expect.objectContaining({ kind: 'found' })
				}
			])
		);
	});
	it('keeps the legacy sync name equal to the edited note title', async () => {
		const { owner, note, catalog } = await setup('12203');
		await catalog.save(owner, { ...note, title: 'Ship checklist' });
		expect(await context.client`select name from skills where note_id = ${note.id}`).toEqual([
			{ name: 'Ship checklist' }
		]);
	});
	it('prevents a metadata writer from changing the derived display name', async () => {
		const { note } = await setup('12204');
		await context.client`update skills set name = 'Independent name' where note_id = ${note.id}`;
		expect(await context.client`select name from skills where note_id = ${note.id}`).toEqual([
			{ name: note.title }
		]);
	});
	it('rolls back the name projection with a rejected rename', async () => {
		const { owner, note, catalog, transactionRunner } = await setup('12205');
		await transactionRunner
			.run(async () => {
				await catalog.save(owner, { ...note, title: 'Ship checklist' });
				throw new Error('Reject rename');
			})
			.catch(() => ({ kind: 'failure' }));
		expect(
			await context.client`select notes.title, skills.name from notes join skills on skills.note_id = notes.id where notes.id = ${note.id}`
		).toEqual([{ title: note.title, name: note.title }]);
	});
	it('rolls back both sync resources with a rejected rename', async () => {
		const { owner, note, catalog, transactionRunner, journal } = await setup('12206');
		const initial = await journal.pullPage(owner, initialSyncCursor);
		await transactionRunner
			.run(async () => {
				await catalog.save(owner, { ...note, title: 'Ship checklist' });
				throw new Error('Reject rename');
			})
			.catch(() => ({ kind: 'failure' }));
		expect(await journal.pullPage(owner, initial.cursor)).toEqual({
			cursor: initial.cursor,
			records: [],
			hasMore: false
		});
	});
});
