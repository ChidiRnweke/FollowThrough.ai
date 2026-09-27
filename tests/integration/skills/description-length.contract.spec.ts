import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { context, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

const setup = async (suffix: string) => {
	const seed = await seedNote(suffix);
	const tx = createTransactionContext(context.db);
	const controller = skillController(tx.database, tx.transactionRunner);
	const { skill } = await controller.create(seed.owner, {
		name: 'Review',
		projectId: seed.project.id,
		description: 'Review changes'
	});
	return { ...seed, ...tx, controller, skill };
};
it('rejects an oversized direct metadata edit without replacing saved fields', async () => {
	const { owner, controller, skill } = await setup('21501');
	const result = await controller
		.update(owner, { noteId: skill.note.id, description: 'x'.repeat(1025), isEnabled: false })
		.then(
			() => ({ kind: 'saved' }),
			(error: Error) => ({ kind: 'failure', error })
		);
	expect({
		result,
		skill: await new SkillRecords(context.db).findByNoteId(owner, skill.note.id)
	}).toMatchObject({
		result: { kind: 'failure', error: { code: 'VALIDATION' } },
		skill: { description: 'Review changes', isEnabled: true }
	});
});
it('rejects an oversized synchronized description without persisting its companion toggle', async () => {
	const { owner, controller, skill, database } = await setup('21502');
	const sync = createSyncCapability({ db: database });
	const base = await sync.objects.read(owner, { type: 'skills', id: [skill.note.id] }, null);
	if (base.kind !== 'found') throw new Error('Expected the skill metadata');
	const result = await controller.synchronize(owner, {
		operationId: crypto.randomUUID(),
		baseEtag: base.snapshot.etag,
		command: {
			kind: 'updateSkill',
			noteId: skill.note.id,
			description: 'x'.repeat(1025),
			isEnabled: false
		}
	});
	expect({
		result,
		skill: await new SkillRecords(context.db).findByNoteId(owner, skill.note.id)
	}).toMatchObject({
		result: { kind: 'rejected' },
		skill: { description: 'Review changes', isEnabled: true }
	});
});
