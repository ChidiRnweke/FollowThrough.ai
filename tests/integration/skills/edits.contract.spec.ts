import { expect, it } from 'vitest';
import type { NoteRevisionId } from '$lib/models/notes';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { actor, context, now, replaceNoteFixture, seedNote } from '../database-harness';
import { competingSkillWrites, skillController } from './edit-harness';

const seedSkill = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const note = await replaceNoteFixture({ ...seeded.note, kind: 'skill' });
	await new SkillRecords(context.db).insert(seeded.owner, {
		note,
		slug: `skill-${suffix}`,
		description: 'Initial description',
		triggerHints: [],
		isEnabled: true
	});
	return { ...seeded, note };
};

it('preserves independent metadata edits after waiting for the current skill', async () => {
	const { owner, note } = await seedSkill('19701');
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.update(owner, { noteId: note.id, description: 'Peer description' });
		},
		(skills) => skills.update(owner, { noteId: note.id, isEnabled: false })
	);
	const stored = await new SkillRecords(context.db).findByNoteId(owner, note.id);
	expect({
		result: result.kind,
		description: stored?.description,
		enabled: stored?.isEnabled
	}).toEqual({
		result: 'success',
		description: 'Peer description',
		enabled: false
	});
});

it('returns the current renamed note after a competing metadata edit waits', async () => {
	const { owner, note } = await seedSkill('19702');
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.update(owner, { noteId: note.id, displayName: 'Renamed skill' });
		},
		(skills) => skills.update(owner, { noteId: note.id, isEnabled: false })
	);
	expect(result).toMatchObject({
		kind: 'success',
		value: { skill: { isEnabled: false, note: { title: 'Renamed skill', currentRevision: 2 } } }
	});
});

it('preserves concurrent metadata when restoring an immutable skill version', async () => {
	const { owner, note } = await seedSkill('19703');
	await replaceNoteFixture({ ...note, currentRevision: 2 });
	await new NoteRecords(context.db).insertRevision(owner, {
		id: crypto.randomUUID() as NoteRevisionId,
		noteId: note.id,
		revision: 1,
		title: 'Original skill',
		document: note.document,
		plainText: note.plainText,
		createdAt: now
	});
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.update(owner, { noteId: note.id, isEnabled: false });
		},
		(skills) => skills.restoreVersion(owner, { noteId: note.id, revision: 1 })
	);
	const stored = await new SkillRecords(context.db).findByNoteId(owner, note.id);
	expect({ result: result.kind, enabled: stored?.isEnabled, title: stored?.note.title }).toEqual({
		result: 'success',
		enabled: false,
		title: 'Original skill'
	});
});

it('rejects a stale document base after a concurrent skill edit commits', async () => {
	const { owner, note } = await seedSkill('19704');
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.update(owner, {
				noteId: note.id,
				content: { kind: 'instructions', text: 'Peer instructions', baseRevision: 1 }
			});
		},
		(skills) =>
			skills.update(owner, {
				noteId: note.id,
				content: { kind: 'instructions', text: 'Stale instructions', baseRevision: 1 }
			})
	);
	expect(result).toMatchObject({ kind: 'failure', error: { code: 'STALE_REVISION' } });
});

it('preserves a disabled built-in while concurrent provisioning waits', async () => {
	const owner = actor('19705');
	// First provisioning uses the real controller transaction; subsequent calls share the same identity.
	const initial = createTransactionContext(context.db);
	await skillController(initial.database, initial.transactionRunner).list(owner);
	const note = (await new NoteRecords(context.db).findByBuiltInKey(owner, 'followthrough'))!;
	const result = await competingSkillWrites(
		async (skills) => {
			await skills.update(owner, { noteId: note.id, isEnabled: false });
		},
		(skills) => skills.list(owner)
	);
	expect({
		result: result.kind,
		enabled: (await new SkillRecords(context.db).findByNoteId(owner, note.id))?.isEnabled
	}).toEqual({ result: 'success', enabled: false });
});
