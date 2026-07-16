import { describe, expect, it } from 'vitest';
import { SkillManagementService } from './management';
import { InMemorySkillRepository } from '$lib/testing/fakes/in-memory-artifact-repositories';
import { InMemoryNoteRepository } from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/fakes/in-memory-provenance-repository';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow,
	testProvenanceId
} from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const skills = new InMemorySkillRepository();
	const notes = new InMemoryNoteRepository();
	const provenance = new InMemoryProvenanceRepository();
	notes.notes = [
		noteBuilder({ plainText: 'Write decisions clearly.' }),
		noteBuilder({ id: testNoteId(2), title: 'Context' })
	];
	provenance.provenance = [
		{
			id: testProvenanceId(),
			userId: testActor().userId,
			producerKind: 'agent',
			producerName: 'Agent',
			metadata: {},
			createdAt: testNow
		}
	];
	return { skills, notes, service: new SkillManagementService(skills, notes, provenance) };
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

	it('does not create a skill note for an empty name', async () => {
		const { service, notes } = setup();
		try {
			await service.createFromSelection(
				testActor(),
				{ noteId: testNoteId(), text: 'Instructions', from: 0, to: 12, revision: 1 },
				{ name: ' ', description: '', triggerHints: [], provenanceId: testProvenanceId() }
			);
		} catch {
			// Absence of a partially-created note is the invariant under test.
		}
		expect(notes.notes).toHaveLength(2);
	});

	it('creates a skill document in the source project', async () => {
		const { service } = setup();
		const skill = await service.createFromSelection(
			testActor(),
			{ noteId: testNoteId(), text: 'Write decisions clearly.', from: 0, to: 24, revision: 1 },
			{
				name: 'Decision writing',
				description: 'Writes decisions',
				triggerHints: ['decision'],
				provenanceId: testProvenanceId()
			}
		);
		expect(skill.note.projectId).toBe(noteBuilder().projectId);
	});

	it('records usage with its real provenance', async () => {
		const { service, skills } = setup();
		skills.skills = [
			{
				note: noteBuilder({ kind: 'skill' }),
				name: 'Decision writing',
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
				note: noteBuilder({ kind: 'skill' }),
				name: 'Decision writing',
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

	it('restores an immutable skill snapshot as a new current revision', async () => {
		const { service, skills, notes } = setup();
		const current = noteBuilder({
			kind: 'skill',
			title: 'Current instructions',
			plainText: 'Current content',
			currentRevision: 2
		});
		notes.notes[0] = current;
		notes.revisions = [
			{
				id: '00000000-0000-4000-0008-000000000001' as never,
				noteId: current.id,
				revision: 1,
				title: 'Original instructions',
				document: { type: 'doc', content: [] },
				plainText: 'Original content',
				createdAt: testNow
			}
		];
		skills.skills = [
			{
				note: current,
				name: current.title,
				description: 'Instructions',
				triggerHints: ['instruction'],
				isEnabled: true
			}
		];
		const restored = await service.restoreVersion(testActor(), current.id, 1);
		expect({
			revision: restored.note.currentRevision,
			title: restored.note.title,
			plainText: restored.note.plainText,
			versionCount: notes.revisions.length,
			restoredAttachmentSnapshot: notes.restoredAttachmentSnapshots[0]
		}).toEqual({
			revision: 3,
			title: 'Original instructions',
			plainText: 'Original content',
			versionCount: 2,
			restoredAttachmentSnapshot: '00000000-0000-4000-0008-000000000001'
		});
	});
});
