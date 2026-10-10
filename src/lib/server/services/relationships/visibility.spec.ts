import { expect, it } from 'vitest';
import type { NoteRelationship } from '$lib/models/notes';
import { createRelationshipServices } from '$lib/server/factories/capabilities/relationships-capability-factory';
import { InMemoryRelationshipRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const relation: NoteRelationship = {
	id: 'a0000000-0000-4000-8000-000000000001' as NoteRelationship['id'],
	userId: testActor().userId,
	sourceNoteId: testNoteId(),
	targetNoteId: testNoteId(2),
	kind: 'mentions',
	createdAt: testNow,
	updatedAt: testNow
};
const setup = () => {
	const notes = new InMemoryNoteRepository();
	const source = noteBuilder();
	const target = noteBuilder({ id: testNoteId(2) });
	const graph = createRelationshipServices(
		new InMemoryRelationshipRepository(),
		notes,
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository()
	);
	return { notes, source, target, graph };
};
it('returns only relationships whose source and target are readable', async () => {
	const { notes, source, target, graph } = setup();
	notes.notes = [source, target];
	const readable = { ...relation, id: `${relation.id}-readable` as NoteRelationship['id'] };
	const missingTarget = {
		...relation,
		id: `${relation.id}-missing-target` as NoteRelationship['id'],
		targetNoteId: '00000000-0000-4000-8000-000000000003' as NoteRelationship['targetNoteId']
	};
	const missingSource = {
		...relation,
		id: `${relation.id}-missing-source` as NoteRelationship['id'],
		sourceNoteId: '00000000-0000-4000-8000-000000000003' as NoteRelationship['sourceNoteId'],
		targetNoteId: target.id
	};
	expect(
		await graph.contexts.readContexts(testActor(), [missingTarget, missingSource, readable])
	).toEqual([{ relationship: readable, source, target }]);
});
