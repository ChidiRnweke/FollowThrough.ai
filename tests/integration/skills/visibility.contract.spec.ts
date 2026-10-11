import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { actor, context, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

const setup = async (suffix: string) => {
	const seed = await seedNote(suffix);
	const tx = createTransactionContext(context.db);
	const controller = skillController(tx.database, tx.transactionRunner);
	const { skill } = await controller.create({
		name: 'Reviewing changes',
		projectId: seed.project.id
	});
	return { ...seed, skill, controller };
};
it('hides a skill catalog entry and detail after its project is archived', async () => {
	const { owner, project, skill, controller } = await setup('21201');
	await new ProjectRecords(owner, context.db).archive(project.id);
	const result = await controller.get({ noteId: skill.note.id }).then(
		() => ({ kind: 'success' }),
		(error: Error) => ({ kind: 'failure', error })
	);
	expect({ result, catalog: await new SkillRecords(owner, context.db).listAll() }).toMatchObject({
		result: { kind: 'failure', error: { code: 'NOT_FOUND' } },
		catalog: []
	});
});
it('does not open another account’s skill detail', async () => {
	const { skill, controller } = await setup('21202');
	await expect(controller.get({ noteId: skill.note.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
it('keeps a disabled skill readable for its owner', async () => {
	const { owner, skill, controller } = await setup('21204');
	await controller.update({ noteId: skill.note.id, isEnabled: false });
	expect(await controller.get({ noteId: skill.note.id })).toMatchObject({
		skill: { isEnabled: false, note: { id: skill.note.id } }
	});
});
