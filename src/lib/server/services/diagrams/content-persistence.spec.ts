import { expect, it } from 'vitest';
import { DiagramLibrary } from './library';
import type { DiagramContentWrite } from '$lib/models/diagrams';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	drawioBuilder,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { testActor, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const current = drawioBuilder({
		provenanceId: testProvenanceId(),
		source: VALID_DRAWIO_XML.replace('API &amp; worker', 'Before'),
		currentRevision: 1,
		publishedRevision: 0,
		publishedAt: undefined
	});
	diagrams.diagrams = [current];
	const library = new DiagramLibrary(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository(),
		new InMemoryProjectRepository()
	);
	const write: DiagramContentWrite = {
		kind: 'drawio',
		diagramId: current.id,
		source: VALID_DRAWIO_XML,
		renderedSvg: '<svg/>',
		searchableText: 'API & worker',
		expectedUpdatedAt: current.updatedAt,
		updatedAt: current.updatedAt,
		expectedRevision: current.currentRevision,
		expectedPublishedRevision: current.publishedRevision
	};
	return { diagrams, current, library, write };
};

it('preserves placement, provenance and publication state when storing reviewed content', async () => {
	const { current, library, write } = setup();
	expect(await library.persistContent(testActor(), write)).toEqual({
		...current,
		source: write.source,
		renderedSvg: write.renderedSvg,
		searchableText: write.searchableText
	});
});

it('refuses content writes for another actor', async () => {
	const { library, write } = setup();
	await expect(library.persistContent(testActor(2), write)).rejects.toMatchObject({
		code: 'STALE_REVISION'
	});
});

it('refuses content writes after publication state changes', async () => {
	const { diagrams, current, library, write } = setup();
	diagrams.diagrams = [
		{
			...current,
			publishedRevision: current.publishedRevision + 1,
			publishedAt: current.updatedAt,
			currentRevision: current.currentRevision + 1
		}
	];
	await expect(library.persistContent(testActor(), write)).rejects.toMatchObject({
		code: 'STALE_REVISION'
	});
});

it('refuses Mermaid content without owned provenance', async () => {
	const { current, library, write, diagrams } = setup();
	diagrams.diagrams = [mermaidBuilder({ id: current.id })];
	await expect(
		library.persistContent(testActor(), {
			kind: 'mermaid',
			diagramId: current.id,
			source: 'flowchart LR\nA --> C',
			title: current.title,
			renderedSvg: '<svg/>',
			searchableText: 'A C',
			expectedUpdatedAt: write.expectedUpdatedAt,
			updatedAt: write.updatedAt,
			provenanceId: testProvenanceId(2)
		})
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
