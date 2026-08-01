import { describe, expect, it } from 'vitest';
import { DiagramLibrary } from './library';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { mermaidBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const provenance = new InMemoryProvenanceRepository();
	notes.notes = [noteBuilder()];
	return {
		diagrams,
		notes,
		anchors,
		provenance,
		service: new DiagramLibrary(diagrams, notes, anchors, provenance)
	};
};

describe('Diagram management invariants', () => {
	it('rejects a diagram for a missing note', async () => {
		const { service } = setup();
		await expect(
			service.create(testActor(), mermaidBuilder({ noteId: testNoteId(2) }))
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('persists a diagram for an owned note', async () => {
		const { service, diagrams } = setup();
		await service.create(testActor(), mermaidBuilder());
		expect(diagrams.diagrams).toHaveLength(1);
	});

	it('rejects a diagram carrying another user identity', async () => {
		const { service } = setup();
		await expect(
			service.create(testActor(), mermaidBuilder({ userId: testActor(2).userId }))
		).rejects.toMatchObject({ code: 'OWNERSHIP' });
	});

	it('deletes an existing owned diagram', async () => {
		const { service, diagrams } = setup();
		diagrams.diagrams = [mermaidBuilder()];
		await service.delete(testActor(), mermaidBuilder().id);
		expect(diagrams.diagrams).toEqual([]);
	});
});
