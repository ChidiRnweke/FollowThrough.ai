import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { actor, context, replaceNoteFixture, seedNote } from '../database-harness';
import { skillController } from './edit-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const actor = seeded.owner;
	const note = await replaceNoteFixture({ ...seeded.note, kind: 'skill' });
	const skill = {
		note,
		slug: `skill-${suffix}`,
		description: 'Original instructions',
		triggerHints: [],
		license: 'MIT',
		compatibility: 'Node 22',
		metadata: { owner: 'author' },
		allowImplicitInvocation: true,
		isEnabled: true
	};
	return { ...seeded, skill, records: new SkillRecords(actor, context.db) };
};

it('clears omitted license and compatibility when importing a complete manifest', async () => {
	const { owner, skill, records } = await setup('19901');
	await records.insert(skill);
	const { database, transactionRunner } = createTransactionContext(context.db);
	await skillController(owner, database, transactionRunner).update({
		noteId: skill.note.id,
		content: {
			kind: 'manifest',
			baseRevision: 1,
			manifest: {
				slug: skill.slug,
				description: 'Replacement instructions',
				metadata: {},
				allowImplicitInvocation: false,
				instructions: 'New instructions'
			}
		}
	});
	const saved = (await records.findByNoteId(skill.note.id))!;
	expect({
		license: saved.license,
		compatibility: saved.compatibility,
		metadata: saved.metadata,
		implicit: saved.allowImplicitInvocation
	}).toEqual({ license: undefined, compatibility: undefined, metadata: {}, implicit: false });
});

it('refuses to recreate missing metadata during an update', async () => {
	const { skill, records } = await setup('19902');
	await expect(records.update(skill)).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('refuses to replace existing metadata during insertion', async () => {
	const { skill, records } = await setup('19903');
	await records.insert(skill);
	await expect(
		records.insert({ ...skill, description: 'Unintended replacement' })
	).rejects.toMatchObject({ code: 'CONFLICT' });
});

it('refuses metadata writes to another actor’s note', async () => {
	const { skill, records } = await setup('19904');
	await records.insert(skill);
	await expect(
		new SkillRecords(actor('19905'), context.db).update({ ...skill, isEnabled: false })
	).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
