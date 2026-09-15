import { describe, expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from '$lib/server/controllers/skills/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { createSkillsCapability } from '$lib/server/factories/capabilities/skills-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database, transactionRunner });
	const { library } = createSkillsCapability({
		db: database,
		projects: new ProjectRecords(database),
		notes: new NoteRecords(database),
		provenance: new ProvenanceRecords(database)
	});
	await library.create(seeded.owner, seeded.note, {
		name: 'Writing',
		description: 'Write clearly',
		triggerHints: []
	});
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			syncMutations: sync.mutations,
			skillEditor: library,
			skillUsageLister: library,
			transactionRunner
		})
	);
	const base = await sync.objects.read(
		seeded.owner,
		{ type: 'skills', id: [seeded.note.id] },
		null
	);
	if (base.kind !== 'found') throw new Error('The skill metadata must exist');
	return { ...seeded, controller, base: base.snapshot.etag };
};

describe('guarded skill metadata writes', () => {
	it('replays a description write without changing its note body version', async () => {
		const { owner, note, controller, base } = await setup('9381');
		const before =
			await context.client`select document, current_revision from notes where id = ${note.id}`;
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag: base,
			command: { kind: 'updateSkill' as const, noteId: note.id, description: 'Offline description' }
		};
		await controller.synchronize(owner, input);
		await controller.synchronize(owner, input);
		expect({
			notes:
				await context.client`select document, current_revision from notes where id = ${note.id}`,
			skills: await context.client`select description from skills where note_id = ${note.id}`
		}).toEqual({ notes: before, skills: [{ description: 'Offline description' }] });
	});
	it('preserves a concurrent description instead of overwriting it with a stale toggle', async () => {
		const { owner, note, controller, base } = await setup('9382');
		await context.client`update skills set description = 'Other client' where note_id = ${note.id}`;
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: base,
			command: { kind: 'updateSkill', noteId: note.id, isEnabled: false }
		});
		expect({
			kind: result.kind,
			rows: await context.client`select description, is_enabled from skills where note_id = ${note.id}`
		}).toEqual({ kind: 'conflict', rows: [{ description: 'Other client', is_enabled: true }] });
	});
});
