import { describe, expect, it } from 'vitest';
import { RelationshipGraph } from './graph';
import { InMemoryRelationshipRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	anchorBuilder,
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const records = new InMemoryRelationshipRepository();
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	notes.notes = [noteBuilder(), noteBuilder({ id: testNoteId(2) })];
	anchors.anchors = [anchorBuilder()];
	return {
		records,
		graph: new RelationshipGraph(records, notes, anchors, new InMemoryProvenanceRepository()),
		input: {
			sourceNoteId: testNoteId(),
			targetNoteId: testNoteId(2),
			kind: 'elaborates' as const
		}
	};
};

describe('Relationship write decisions', () => {
	it('returns an unchanged edge with its original identity, origin and timestamps', async () => {
		const { graph, records, input } = setup();
		const original = await graph.create(testActor(), {
			...input,
			sourceAnchorId: anchorBuilder().id,
			justification: 'Original'
		});
		const change = await graph.createWithChange(testActor(), {
			...input,
			justification: 'Original'
		});
		expect({ change, stored: records.relationships }).toEqual({
			change: { kind: 'unchanged', after: original },
			stored: [original]
		});
	});
	it('records both snapshots when an explanation changes without replacing its origin', async () => {
		const { graph, records, input } = setup();
		const original = await graph.create(testActor(), {
			...input,
			sourceAnchorId: anchorBuilder().id,
			justification: 'Original'
		});
		const change = await graph.createWithChange(testActor(), {
			...input,
			justification: 'Revised'
		});
		const after = { ...original, justification: 'Revised', updatedAt: change.after.updatedAt };
		expect({ change, stored: records.relationships }).toEqual({
			change: { kind: 'modified', before: original, after },
			stored: [after]
		});
	});
	it('clears an existing explanation when the proposed explanation is absent', async () => {
		const { graph, input } = setup();
		await graph.create(testActor(), { ...input, justification: 'Original' });
		const change = await graph.createWithChange(testActor(), input);
		expect(change.after.justification).toBeUndefined();
	});
});
