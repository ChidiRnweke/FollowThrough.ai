import { describe, expect, it } from 'vitest';
import { SkillLibrary } from './library';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const skills = new InMemorySkillRepository(notes);
	const provenance = new InMemoryProvenanceRepository();
	notes.notes = [
		noteBuilder({
			kind: 'skill',
			title: 'Decision writing',
			plainText: 'Write decisions clearly.'
		}),
		noteBuilder({ id: testNoteId(2), title: 'Context' })
	];
	provenance.provenance = [
		{
			id: testProvenanceId(),
			userId: testActor().userId,
			producerKind: 'agent',
			producerName: 'Agent memory',
			pipeline: 'memory',
			metadata: {},
			createdAt: testNow
		}
	];
	return {
		skills,
		notes,
		service: new SkillLibrary(skills, notes, provenance)
	};
};

describe('Skill management invariants', () => {
	it('rejects an empty skill name', async () => {
		const { service } = setup();
		await expect(
			service.create(testActor(), noteBuilder(), {
				name: '  ',
				description: 'Description',
				triggerHints: []
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('records usage with its real provenance', async () => {
		const { service, skills } = setup();
		skills.skills = [
			{
				note: noteBuilder({ kind: 'skill', title: 'Decision writing' }),

				description: 'Writes decisions',
				triggerHints: ['decision'],
				isEnabled: true
			}
		];
		await service.record(testActor(), {
			skillNoteId: testNoteId(),
			contextNoteId: testNoteId(2),
			provenanceId: testProvenanceId()
		});
		expect(skills.usages[0]?.provenanceId).toBe(testProvenanceId());
	});

	it('records a user-global skill usage in another owned project', async () => {
		const { service, skills, notes } = setup();
		skills.skills = [
			{
				note: noteBuilder({ kind: 'skill', title: 'Decision writing' }),

				description: 'Writes decisions',
				triggerHints: ['decision'],
				isEnabled: true
			}
		];
		notes.notes[1] = noteBuilder({
			id: testNoteId(2),
			projectId: '00000000-0000-4000-0002-000000000002' as never
		});
		await service.record(testActor(), {
			skillNoteId: testNoteId(),
			contextNoteId: testNoteId(2),
			provenanceId: testProvenanceId()
		});
		expect(skills.usages[0]?.contextNoteId).toBe(testNoteId(2));
	});
});
