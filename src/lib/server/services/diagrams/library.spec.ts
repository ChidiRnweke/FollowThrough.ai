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
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { diagramEtag } from '$lib/models/diagrams';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const provenance = new InMemoryProvenanceRepository();
	const projects = new InMemoryProjects();
	notes.notes = [noteBuilder()];
	projects.projects = [projectBuilder()];
	return {
		diagrams,
		notes,
		anchors,
		provenance,
		projects,
		service: new DiagramLibrary(diagrams, notes, anchors, provenance, projects)
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

	it('rejects a diagram assigned to a project the actor does not own', async () => {
		const { service, projects } = setup();
		const foreign = projectBuilder({ id: testProjectId(2), userId: testActor(2).userId });
		projects.projects.push(foreign);
		await expect(
			service.create(testActor(), mermaidBuilder({ projectId: foreign.id }))
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
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

	it('trims a renamed diagram title', async () => {
		const { service, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		expect(
			(await service.rename(testActor(), diagram.id, '  Architecture  ', diagramEtag(diagram)))
				.title
		).toBe('Architecture');
	});

	it('rejects an empty renamed diagram title', async () => {
		const { service, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await expect(
			service.rename(testActor(), diagram.id, '   ', diagramEtag(diagram))
		).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
});

describe('Diagram publication invariants', () => {
	it('autosaves source as an unpublished revision', async () => {
		const { service, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		const saved = await service.saveDraftSource(
			testActor(),
			diagram.id,
			'<mxfile>draft</mxfile>',
			'draft',
			diagramEtag(diagram)
		);
		expect(saved.currentRevision > saved.publishedRevision).toBe(true);
	});

	it('publishing records an immutable snapshot', async () => {
		const { service, diagrams } = setup();
		const diagram = drawioBuilder({
			currentRevision: 2,
			publishedRevision: 1,
			source: '<mxfile>draft</mxfile>'
		});
		diagrams.diagrams = [diagram];
		await service.publish(
			testActor(),
			diagram.id,
			diagram.source,
			'<svg/>',
			'draft',
			diagramEtag(diagram)
		);
		expect(diagrams.diagramRevisions).toHaveLength(1);
	});

	it('publishing advances the published revision', async () => {
		const { service, diagrams } = setup();
		const diagram = drawioBuilder({
			currentRevision: 2,
			publishedRevision: 1,
			source: '<mxfile>draft</mxfile>'
		});
		diagrams.diagrams = [diagram];
		const published = await service.publish(
			testActor(),
			diagram.id,
			diagram.source,
			'<svg/>',
			'draft',
			diagramEtag(diagram)
		);
		expect(published.publishedRevision).toBe(2);
	});

	it('rejects a stale draft write', async () => {
		const { service, diagrams } = setup();
		const diagram = drawioBuilder({ currentRevision: 2 });
		diagrams.diagrams = [diagram];
		await expect(
			service.saveDraftSource(
				testActor(),
				diagram.id,
				'<mxfile>draft</mxfile>',
				'draft',
				diagramEtag(drawioBuilder())
			)
		).rejects.toMatchObject({ code: 'STALE_REVISION' });
	});
});
