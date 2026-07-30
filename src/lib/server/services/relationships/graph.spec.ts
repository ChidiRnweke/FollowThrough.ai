import { describe, expect, it } from 'vitest';
import { RelationshipGraph } from './graph';
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
		service: new RelationshipGraph(relationships, notes, anchors, provenance)
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

/**
 * Reconciliation keeps the `mentions` rows equal to the links in the document, which is
 * what makes a backlink appear — and disappear when the link is edited away.
 */
describe('Reconciling a note’s links', () => {
	const source = () => noteBuilder();
	const listMentions = async (relationships: InMemoryRelationshipRepository) =>
		(await relationships.listForNote(testActor(), testNoteId())).filter(
			(row) => row.kind === 'mentions'
		);

	it('creates a row for a new link', async () => {
		const { service, relationships } = setup();
		await service.reconcile(testActor(), source(), [testNoteId(2)]);
		expect((await listMentions(relationships)).map((row) => row.targetNoteId)).toEqual([
			testNoteId(2)
		]);
	});

	it('creates nothing twice for the same link', async () => {
		const { service, relationships } = setup();
		await service.reconcile(testActor(), source(), [testNoteId(2)]);
		await service.reconcile(testActor(), source(), [testNoteId(2)]);
		expect(await listMentions(relationships)).toHaveLength(1);
	});

	/** Editing a link out of the document must stop it producing a backlink. */
	it('removes a row for a link deleted from the document', async () => {
		const { service, relationships } = setup();
		await service.reconcile(testActor(), source(), [testNoteId(2)]);
		await service.reconcile(testActor(), source(), []);
		expect(await listMentions(relationships)).toHaveLength(0);
	});

	/**
	 * These come from the AI suggestion pipeline and have no representation in the
	 * document, so an absent link must never be read as a reason to delete them.
	 */
	it('leaves an AI-inferred relationship untouched', async () => {
		const { service, relationships } = setup();
		await service.create(testActor(), {
			sourceNoteId: testNoteId(),
			targetNoteId: testNoteId(2),
			kind: 'elaborates'
		});
		await service.reconcile(testActor(), source(), []);
		const remaining = await relationships.listForNote(testActor(), testNoteId());
		expect(remaining.map((row) => row.kind)).toEqual(['elaborates']);
	});

	it('never links a note to itself', async () => {
		const { service, relationships } = setup();
		await service.reconcile(testActor(), source(), [testNoteId()]);
		expect(await listMentions(relationships)).toHaveLength(0);
	});

	/** The picker scopes to the project, so this means the target moved after the fact. */
	it('skips a target in another project rather than failing the save', async () => {
		const { service, relationships, notes } = setup();
		notes.notes = [
			noteBuilder(),
			noteBuilder({ id: testNoteId(2), projectId: testProjectId(2) as never })
		];
		await service.reconcile(testActor(), source(), [testNoteId(2)]);
		expect(await listMentions(relationships)).toHaveLength(0);
	});

	it('skips a target that no longer exists', async () => {
		const { service, relationships } = setup();
		await service.reconcile(testActor(), source(), [testNoteId(9)]);
		expect(await listMentions(relationships)).toHaveLength(0);
	});
});
