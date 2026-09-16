import { describe, it, expect } from 'vitest';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { requirePreparedChange } from '$lib/testing/notes/fixtures/reviewed-changes';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string, target: 'authored' | 'skill' = 'authored') => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const { catalog, markdown } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const consequences = new InMemoryNoteContent();
	const note =
		target === 'skill'
			? await catalog.create(seeded.owner, {
					documentKind: 'skill',
					title: 'Release checklist',
					projectId: seeded.project.id
				})
			: seeded.note;
	if (target === 'skill')
		await new SkillRecords(database).insert(seeded.owner, {
			note,
			slug: 'release-checklist',
			description: 'Release instructions',
			triggerHints: ['release'],
			isEnabled: true,
			allowImplicitInvocation: false,
			metadata: { owner: 'release-team' }
		});
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
		await controller.prepareChange(
			seeded.owner,
			{
				kind: 'replace',
				noteId: note.id,
				markdown: 'Launch Tuesday.'
			},
			target
		)
	);
	return { ...seeded, note, controller, change, consequences };
};

describe('Reviewed note writes on PostgreSQL', () => {
	it('saves a reviewed skill body as a draft without changing metadata or publishing history', async () => {
		const { controller, change, owner, note } = await setup('97106', 'skill');
		const skills = new SkillRecords(context.db);
		const before = await skills.findByNoteId(owner, note.id);
		if (!before) throw new Error('Expected the created skill metadata');
		const records = new NoteRecords(context.db);
		const history = await records.listRevisions(owner, note.id);
		await controller.applyReviewedChange(owner, change, 'skill');
		await controller.applyReviewedChange(owner, change, 'skill');
		expect({
			skill: await skills.findByNoteId(owner, note.id),
			history: await records.listRevisions(owner, note.id)
		}).toMatchObject({
			skill: {
				...before,
				note: {
					...change.result,
					title: note.title,
					currentRevision: 2,
					publishedRevision: 0,
					kind: 'skill'
				}
			},
			history
		});
	});
	it('preserves a newer skill body when an older review is approved', async () => {
		const { controller, change, owner, note } = await setup('97107', 'skill');
		const newer = await controller.save(owner, {
			note: { ...note, title: 'Newer release instructions' }
		});
		const result = await controller.applyReviewedChange(owner, change, 'skill');
		expect({
			result,
			note: await new NoteRecords(context.db).findById(owner, note.id)
		}).toMatchObject({
			result: { kind: 'failure', code: 'STALE_REVIEW' },
			note: newer.note
		});
	});
	it('persists the prepared content with one revision increment', async () => {
		const { controller, change, owner, note } = await setup('97101');
		await controller.applyReviewedChange(owner, change, 'authored');
		expect(await new NoteRecords(context.db).findById(owner, note.id)).toMatchObject({
			...change.result,
			currentRevision: 2
		});
	});
	it('refuses a review after another database writer changes its base', async () => {
		const { controller, change, owner, note } = await setup('97102');
		await controller.save(owner, { note: { ...note, title: 'A newer title' } });
		expect(await controller.applyReviewedChange(owner, change, 'authored')).toMatchObject({
			kind: 'failure',
			code: 'STALE_REVIEW'
		});
	});
	it('rolls back a committed candidate when indexing fails', async () => {
		const { controller, change, owner, note, consequences } = await setup('97103');
		consequences.failIndex = true;
		const outcome = await controller.applyReviewedChange(owner, change, 'authored').then(
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
		await controller.applyReviewedChange(owner, change, 'authored');
		await controller.applyReviewedChange(owner, change, 'authored');
		expect((await new NoteRecords(context.db).findById(owner, note.id))?.currentRevision).toBe(2);
	});
	it('admits only one of two competing reviewed results', async () => {
		const { controller, change, owner, note } = await setup('97105');
		const other = requirePreparedChange(
			await controller.prepareChange(
				owner,
				{
					kind: 'replace',
					noteId: note.id,
					markdown: 'Launch Friday.'
				},
				'authored'
			)
		);
		const outcomes = await Promise.all([
			controller.applyReviewedChange(owner, change, 'authored'),
			controller.applyReviewedChange(owner, other, 'authored')
		]);
		expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['failure', 'saved']);
	});
});
