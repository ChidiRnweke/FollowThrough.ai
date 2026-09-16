import { describe, expect, it } from 'vitest';
import type { SkillUsageId } from '$lib/models/skills';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { context, now, seedNote, seedProvenance } from '../database-harness';
const seedSkillNote = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { catalog } = createNotesCapability({
		db: context.db,
		projects: new ProjectRecords(context.db)
	});
	const note = await catalog.create(seeded.owner, {
		documentKind: 'skill',
		projectId: seeded.project.id,
		title: 'Contract skill'
	});
	return { ...seeded, note };
};
describe('Postgres skill repository invariants', () => {
	it('persists skill usage provenance', async () => {
		const { owner, note } = await seedSkillNote('33');
		const provenance = await seedProvenance(owner, '33');
		const repository = new SkillRecords(context.db);
		await repository.insert(owner, {
			note,
			description: 'Contract',
			triggerHints: ['contract'],
			isEnabled: true
		});
		const usage = await repository.recordUsage(owner, {
			id: 'b0000000-0000-4000-8000-000000000033' as SkillUsageId,
			skillNoteId: note.id,
			provenanceId: provenance.id,
			createdAt: now
		});
		expect(usage.provenanceId).toBe(provenance.id);
	});
	it('hides enabled skills from an archived project', async () => {
		const { owner, note, project } = await seedSkillNote('49');
		const repository = new SkillRecords(context.db);
		await repository.insert(owner, {
			note,
			description: 'Contract',
			triggerHints: ['contract'],
			isEnabled: true
		});
		await new ProjectRecords(context.db).archive(owner, project.id);
		expect(await repository.listEnabled(owner)).toEqual([]);
	});
});
