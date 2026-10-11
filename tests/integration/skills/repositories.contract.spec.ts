import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { storedNote } from '$lib/testing/notes/fixtures/stored-note';
import { describe, expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { context, seedNote } from '../database-harness';
const seedSkillNote = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { services: catalog } = createNotesCapability(testActor(), {
		db: context.db,
		projects: new ProjectRecords(testActor(), context.db)
	});
	const note = await storedNote(catalog.creator, seeded.owner, {
		kind: 'skill',
		projectId: seeded.project.id,
		title: 'Contract skill'
	});
	return { ...seeded, note };
};
describe('Postgres skill repository invariants', () => {
	it('hides enabled skills from an archived project', async () => {
		const { owner, note, project } = await seedSkillNote('49');
		const repository = new SkillRecords(owner, context.db);
		await repository.insert({
			note,
			description: 'Contract',
			triggerHints: ['contract'],
			slug: 'contract-skill',
			metadata: {},
			allowImplicitInvocation: true,
			isEnabled: true
		});
		await new ProjectRecords(owner, context.db).archive(project.id);
		expect(await repository.listEnabled()).toEqual([]);
	});
});
