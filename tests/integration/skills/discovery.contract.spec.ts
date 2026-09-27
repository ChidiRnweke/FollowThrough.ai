import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { context, seedNote, seedProvenance } from '../database-harness';
import { skillController } from './edit-harness';

it('keeps disabled skills out of automatic discovery while allowing an explicit owned load', async () => {
	const { owner, project } = await seedNote('21901');
	const tx = createTransactionContext(context.db);
	const controller = skillController(tx.database, tx.transactionRunner);
	const { skill } = await controller.create(owner, {
		name: 'Review',
		projectId: project.id,
		instructions: 'Check the facts.'
	});
	await controller.update(owner, { noteId: skill.note.id, isEnabled: false });
	const provenance = await seedProvenance(owner, '21901');
	const loaded = await controller.loadForAgent(owner, {
		noteId: skill.note.id,
		provenanceId: provenance.id
	});
	const records = new SkillRecords(context.db);
	expect({
		automatic: (await records.listEnabled(owner)).map((value) => value.noteId),
		browsable: (await records.listAll(owner)).map((value) => value.noteId),
		loaded: loaded.skill.note.plainText,
		usages: (await records.listUsages(owner, skill.note.id)).map((value) => value.provenanceId)
	}).toEqual({
		automatic: [],
		browsable: [skill.note.id],
		loaded: 'Check the facts.',
		usages: [provenance.id]
	});
});
