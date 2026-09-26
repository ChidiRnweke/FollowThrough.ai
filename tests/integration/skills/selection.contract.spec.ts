import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { provenance } from '$lib/server/db/schema/provenance';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { actor, context, replaceNoteFixture, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const text = 'Always capture consequences.';
	const note = await replaceNoteFixture({
		...seeded.note,
		plainText: text,
		document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
	});
	const tx = createTransactionContext(context.db);
	return {
		...seeded,
		note,
		controller: skillController(tx.database, tx.transactionRunner),
		input: {
			name: 'Decision quality',
			description: 'Improves architecture decisions',
			triggerHints: ['decision'],
			selection: { noteId: note.id, revision: 1, from: 0, to: text.length, text }
		}
	};
};

it('persists the selected body and its source evidence in the source project', async () => {
	const { owner, project, note, controller, input } = await setup('21001');
	const result = await controller.createFromSelection(owner, input);
	const skill = await new SkillRecords(context.db).findByNoteId(owner, result.skillNoteId);
	const anchors = await new SourceAnchorRecords(context.db).listForNote(owner, note.id);
	const origins = await context.db
		.select()
		.from(provenance)
		.where(eq(provenance.userId, owner.userId));
	expect({ skill, anchors, origins }).toMatchObject({
		skill: {
			note: { id: result.skillNoteId, projectId: project.id, plainText: input.selection.text },
			slug: 'decision-quality',
			description: input.description
		},
		anchors: [{ noteId: note.id, quote: input.selection.text, revision: 1 }],
		origins: [
			{
				sourceAnchorId: anchors[0]?.id,
				producerKind: 'user',
				producerName: 'Create Skill From Selection'
			}
		]
	});
});

it('rolls back source evidence and the candidate note after a duplicate skill name', async () => {
	const { owner, note, project, controller, input } = await setup('21002');
	const existing = await controller.create(owner, { name: input.name, projectId: project.id });
	const outcome = await controller.createFromSelection(owner, input).then(
		() => 'created',
		() => 'failed'
	);
	const notes = await new NoteRecords(context.db).listActive(owner, project.id);
	expect({
		outcome,
		notes: notes.map((item) => item.id).sort(),
		anchors: await new SourceAnchorRecords(context.db).listForNote(owner, note.id),
		origins: await context.db.select().from(provenance).where(eq(provenance.userId, owner.userId))
	}).toEqual({
		outcome: 'failed',
		notes: [note.id, existing.skill.note.id].sort(),
		anchors: [],
		origins: []
	});
});

it('refuses a selection from another account', async () => {
	const { controller, input } = await setup('21003');
	await expect(controller.createFromSelection(actor('21004'), input)).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});

it('refuses a selection whose note revision has changed', async () => {
	const { owner, note, controller, input } = await setup('21005');
	await replaceNoteFixture({ ...note, currentRevision: 2 });
	await expect(controller.createFromSelection(owner, input)).rejects.toMatchObject({
		code: 'STALE_REVISION'
	});
});
