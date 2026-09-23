import { expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import type { SkillEditInput } from '$lib/models/skills';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { actor, context, replaceNoteFixture, seedNote } from '../database-harness';
import { competingSkillWrites, skillController } from './edit-harness';

const seedSkill = async (suffix: string, owner = actor(suffix)) => {
	const seeded = await seedNote(suffix, owner);
	const note = await replaceNoteFixture({ ...seeded.note, kind: 'skill' });
	const skill = await new SkillRecords(context.db).insert(owner, {
		note,
		slug: `skill-${suffix}`,
		description: 'Initial description',
		triggerHints: [],
		metadata: {},
		allowImplicitInvocation: true,
		isEnabled: true
	});
	return { ...seeded, note, skill };
};

const imported = (noteId: NoteId, slug: string): SkillEditInput => ({
	noteId,
	content: {
		kind: 'manifest',
		baseRevision: 1,
		manifest: {
			slug,
			description: 'Imported description',
			metadata: {},
			allowImplicitInvocation: true,
			instructions: 'Imported instructions'
		}
	}
});

it('rejects a portable name committed by a competing import into another project', async () => {
	const first = await seedSkill('20201');
	const second = await seedSkill('20202', first.owner);
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.update(first.owner, imported(first.note.id, 'release-guide'));
		},
		(skills) => skills.update(first.owner, imported(second.note.id, 'release-guide'))
	);
	const repository = new SkillRecords(context.db);
	expect({
		result,
		first: (await repository.findByNoteId(first.owner, first.note.id))?.slug,
		second: await repository.findByNoteId(first.owner, second.note.id)
	}).toMatchObject({
		result: { kind: 'failure', error: { code: 'VALIDATION' } },
		first: 'release-guide',
		second: second.skill
	});
});

it('rejects an import name committed by a competing direct creation', async () => {
	const first = await seedNote('20203');
	const second = await seedSkill('20204', first.owner);
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.create(first.owner, { projectId: first.project.id, name: 'Release guide' });
		},
		(skills) => skills.update(first.owner, imported(second.note.id, 'release-guide'))
	);
	expect({
		result,
		skill: await new SkillRecords(context.db).findByNoteId(first.owner, second.note.id)
	}).toMatchObject({
		result: { kind: 'failure', error: { code: 'VALIDATION' } },
		skill: second.skill
	});
});

it('allows a portable name released by a competing import after it commits', async () => {
	const first = await seedSkill('20205');
	const second = await seedSkill('20206', first.owner);
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.update(first.owner, imported(first.note.id, 'renamed-guide'));
		},
		(skills) => skills.update(first.owner, imported(second.note.id, first.skill.slug))
	);
	expect(result).toMatchObject({
		kind: 'success',
		value: { skill: { slug: first.skill.slug, note: { plainText: 'Imported instructions' } } }
	});
});

it('rejects a built-in name after provisioning and rolls back the candidate note', async () => {
	const { owner, project } = await seedNote('20207');
	const candidateId = crypto.randomUUID() as NoteId;
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.list(owner);
		},
		(skills) =>
			skills.create(owner, { id: candidateId, projectId: project.id, name: 'FollowThrough' })
	);
	expect({
		result,
		note: await new NoteRecords(context.db).findById(owner, candidateId)
	}).toMatchObject({
		result: { kind: 'failure', error: { code: 'VALIDATION' } },
		note: undefined
	});
});

it('allows separate actors to use the same portable name', async () => {
	const first = await seedNote('20208');
	const second = await seedNote('20209');
	const tx = createTransactionContext(context.db);
	const controller = skillController(tx.database, tx.transactionRunner);
	const results = [];
	for (const { owner, project } of [first, second])
		results.push(await controller.create(owner, { projectId: project.id, name: 'Release guide' }));
	expect(results.map(({ skill }) => skill.slug)).toEqual(['release-guide', 'release-guide']);
});
