import { expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { context, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

it('persists initial instructions with the generated description and returns the saved note', async () => {
	const { owner, project } = await seedNote('21101');
	const tx = createTransactionContext(context.db);
	const { skill } = await skillController(tx.database, tx.transactionRunner).create(owner, {
		name: 'Reviewing changes',
		projectId: project.id,
		description: '',
		instructions: 'Read the diff carefully.'
	});
	const stored = await new SkillRecords(context.db).findByNoteId(owner, skill.note.id);
	expect({
		returned: skill.note.plainText,
		persisted: stored?.note.plainText,
		description: stored?.description
	}).toEqual({
		returned: 'Read the diff carefully.',
		persisted: 'Read the diff carefully.',
		description: 'Reusable instructions for Reviewing changes.'
	});
});

it('rolls back the candidate note and metadata when the initial description is invalid', async () => {
	const { owner, project } = await seedNote('21102');
	const id = crypto.randomUUID() as NoteId;
	const tx = createTransactionContext(context.db);
	const result = await skillController(tx.database, tx.transactionRunner)
		.create(owner, {
			id,
			name: 'Reviewing changes',
			projectId: project.id,
			description: 'x'.repeat(1025),
			instructions: 'Read the diff carefully.'
		})
		.then(
			() => 'created',
			() => 'failed'
		);
	expect({
		result,
		note: await new NoteRecords(context.db).findById(owner, id),
		skill: await new SkillRecords(context.db).findByNoteId(owner, id)
	}).toEqual({ result: 'failed', note: undefined, skill: undefined });
});
