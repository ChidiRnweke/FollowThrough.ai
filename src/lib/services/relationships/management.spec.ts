import { describe, expect, it } from 'vitest';
import { RelationshipManagementService } from './management';
import { InMemoryRelationshipRepository } from '$lib/testing/fakes/in-memory-artifact-repositories';
import { InMemoryNoteRepository } from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryAnchorRepository } from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/fakes/in-memory-provenance-repository';
import {
	anchorBuilder,
	noteBuilder,
	testActor,
	testNoteId,
	testNow,
	testProjectId,
	testProvenanceId
} from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const relationships = new InMemoryRelationshipRepository();
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const provenance = new InMemoryProvenanceRepository();
	notes.notes = [noteBuilder(), noteBuilder({ id: testNoteId(2) })];
	return {
		relationships,
		notes,
		anchors,
		provenance,
		service: new RelationshipManagementService(relationships, notes, anchors, provenance)
	};
};

describe('Relationship management invariants', () => {
	it('rejects a relationship from a note to itself', async () => {
		const { service } = setup();
		await expect(
			service.create(testActor(), {
				sourceNoteId: testNoteId(),
				targetNoteId: testNoteId(),
				kind: 'mentions'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects relationships across projects', async () => {
		const { service, notes } = setup();
		notes.notes[1] = noteBuilder({ id: testNoteId(2), projectId: testProjectId(2) });
		await expect(
			service.create(testActor(), {
				sourceNoteId: testNoteId(),
				targetNoteId: testNoteId(2),
				kind: 'mentions'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('persists a relationship between notes in one project', async () => {
		const { service, relationships } = setup();
		await service.create(testActor(), {
			sourceNoteId: testNoteId(),
			targetNoteId: testNoteId(2),
			kind: 'prior_decision'
		});
		expect(relationships.relationships[0]?.kind).toBe('prior_decision');
	});

	it('rejects an anchor from a note other than the relationship source', async () => {
		const { service, anchors } = setup();
		anchors.anchors = [anchorBuilder({ noteId: testNoteId(2) })];
		await expect(
			service.create(testActor(), {
				sourceNoteId: testNoteId(),
				targetNoteId: testNoteId(2),
				kind: 'mentions',
				sourceAnchorId: anchorBuilder().id
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('retains provenance on a created relationship', async () => {
		const { service, anchors, provenance } = setup();
		anchors.anchors = [anchorBuilder()];
		provenance.provenance = [
			{
				id: testProvenanceId(),
				userId: testActor().userId,
				producerKind: 'pipeline',
				producerName: 'Relate',
				metadata: {},
				createdAt: testNow
			}
		];
		const relationship = await service.create(testActor(), {
			sourceNoteId: testNoteId(),
			targetNoteId: testNoteId(2),
			kind: 'mentions',
			sourceAnchorId: anchorBuilder().id,
			provenanceId: testProvenanceId()
		});
		expect(relationship.provenanceId).toBe(testProvenanceId());
	});

	it('retains the source anchor on a created relationship', async () => {
		const { service, anchors } = setup();
		anchors.anchors = [anchorBuilder()];
		const relationship = await service.create(testActor(), {
			sourceNoteId: testNoteId(),
			targetNoteId: testNoteId(2),
			kind: 'mentions',
			sourceAnchorId: anchorBuilder().id
		});
		expect(relationship.sourceAnchorId).toBe(anchorBuilder().id);
	});
});
