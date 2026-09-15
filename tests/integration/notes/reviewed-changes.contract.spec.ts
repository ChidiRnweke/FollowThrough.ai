import { describe, it, expect } from 'vitest';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { requirePreparedChange } from '$lib/testing/notes/fixtures/reviewed-changes';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const { catalog, markdown } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const consequences = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			markdown,
			transactionRunner,
			noteReader: catalog,
			noteEditor: catalog,
			anchorRepairer: consequences,
			noteLinkReconciler: consequences,
			noteIndexer: consequences
		})
	);
	const change = requirePreparedChange(
		await controller.prepareChange(seeded.owner, {
			kind: 'replace',
			noteId: seeded.note.id,
			markdown: 'Launch Tuesday.'
		})
	);
	return { ...seeded, controller, change, consequences };
};

describe('Reviewed note writes on PostgreSQL', () => {
	it('persists the prepared content with one revision increment', async () => {
		const { controller, change, owner, note } = await setup('97101');
		await controller.applyReviewedChange(owner, change);
		expect(await new NoteRecords(context.db).findById(owner, note.id)).toMatchObject({
			...change.result,
			currentRevision: 2
		});
	});
	it('refuses a review after another database writer changes its base', async () => {
		const { controller, change, owner, note } = await setup('97102');
		await controller.save(owner, { note: { ...note, title: 'A newer title' } });
		expect(await controller.applyReviewedChange(owner, change)).toMatchObject({
			kind: 'failure',
			code: 'STALE_REVIEW'
		});
	});
	it('rolls back a committed candidate when indexing fails', async () => {
		const { controller, change, owner, note, consequences } = await setup('97103');
		consequences.failIndex = true;
		const outcome = await controller.applyReviewedChange(owner, change).then(
			() => 'saved',
			() => 'failed'
		);
		expect({ outcome, saved: await new NoteRecords(context.db).findById(owner, note.id) }).toEqual({
			outcome: 'failed',
			saved: note
		});
	});
	it('does not write another revision when the same review is retried', async () => {
		const { controller, change, owner, note } = await setup('97104');
		await controller.applyReviewedChange(owner, change);
		await controller.applyReviewedChange(owner, change);
		expect((await new NoteRecords(context.db).findById(owner, note.id))?.currentRevision).toBe(2);
	});
	it('admits only one of two competing reviewed results', async () => {
		const { controller, change, owner, note } = await setup('97105');
		const other = requirePreparedChange(
			await controller.prepareChange(owner, {
				kind: 'replace',
				noteId: note.id,
				markdown: 'Launch Friday.'
			})
		);
		const outcomes = await Promise.all([
			controller.applyReviewedChange(owner, change),
			controller.applyReviewedChange(owner, other)
		]);
		expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['failure', 'saved']);
	});
});
