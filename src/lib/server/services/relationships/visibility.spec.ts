import { expect, it } from 'vitest';
import type { NoteRelationship } from '$lib/models/notes';
import { RelationshipGraph } from './graph';
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
	const graph = new RelationshipGraph(
		new InMemoryRelationshipRepository(),
		notes,
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository()
	);
	return { notes, source, target, graph };
};
it('omits a retained relationship when its target is no longer readable', async () => {
	const { notes, source, graph } = setup();
	// The repository read surface excludes the target after its project is archived.
	notes.notes = [source];
	expect(await graph.readContexts(testActor(), [relation])).toEqual([]);
});
it('omits a retained relationship when its source is no longer readable', async () => {
	const { notes, target, graph } = setup();
	notes.notes = [target];
	expect(await graph.readContexts(testActor(), [relation])).toEqual([]);
});
it('retains a relationship while both notes are readable', async () => {
	const { notes, source, target, graph } = setup();
	notes.notes = [source, target];
	expect(await graph.readContexts(testActor(), [relation])).toEqual([
		{ relationship: relation, source, target }
	]);
});
