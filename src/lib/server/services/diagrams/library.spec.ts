import { describe, expect, it } from 'vitest';
import { DiagramLibrary } from './library';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	drawioBuilder,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
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
			service.create(testActor(), mermaidBuilder({ sourceNoteId: testNoteId(2) }))
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

	// A studio diagram is authored in a conversation and owned by its project, so
	// there is no note to look up and no note check to fail.
	it('persists a diagram that names no source note', async () => {
		const { service, diagrams } = setup();
		await service.create(testActor(), mermaidBuilder({ sourceNoteId: undefined }));
		expect(diagrams.diagrams).toHaveLength(1);
	});

	it('lists a note-less diagram under its project', async () => {
		const { service } = setup();
		const diagram = mermaidBuilder({ sourceNoteId: undefined });
		await service.create(testActor(), diagram);
		expect((await service.listForProject(testActor(), diagram.projectId)).diagrams).toEqual([
			diagram
		]);
	});

	// The gallery lists what the studio produced, and promotion always produces
	// draw.io. A Mermaid row is a note's own diagram from the inline workflow, not
	// a project output, so it must not appear alongside them.
	it('lists only draw.io diagrams when the gallery asks for them', async () => {
		const { service, diagrams } = setup();
		const mermaid = mermaidBuilder({ sourceNoteId: undefined });
		const drawio = drawioBuilder({ sourceNoteId: undefined, projectId: mermaid.projectId });
		diagrams.diagrams = [mermaid, drawio];
		const listed = await service.listForProject(testActor(), mermaid.projectId, {
			kind: 'drawio'
		});
		expect(listed.diagrams.map((item) => item.id)).toEqual([drawio.id]);
	});

	it('counts only the kind it was asked for', async () => {
		const { service, diagrams } = setup();
		const mermaid = mermaidBuilder({ sourceNoteId: undefined });
		const drawio = drawioBuilder({ sourceNoteId: undefined, projectId: mermaid.projectId });
		diagrams.diagrams = [mermaid, drawio];
		const listed = await service.listForProject(testActor(), mermaid.projectId, {
			kind: 'drawio'
		});
		expect(listed.total).toBe(1);
	});
});
