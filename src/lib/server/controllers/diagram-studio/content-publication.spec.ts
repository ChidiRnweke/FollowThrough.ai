import { expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';
import { diagramEtag, type DiagramWriteOutcome } from '$lib/models/diagrams';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import {
	DrawioXmlValidator,
	DrawioSvgSanitizer,
	DrawioLabelReader
} from '$lib/server/services/diagrams/drawio';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	InMemorySearchRepository,
	InMemoryEmbeddingClient
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder, testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import {
	drawioBuilder,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { VALID_DRAWIO_XML, RICH_DRAWIO_LABELS_XML } from '$lib/testing/diagrams/fixtures/drawio';

const setup = () => {
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder({ title: 'Deployment decisions' })];
	const diagrams = new InMemoryDiagramRepository();
	const original = drawioBuilder({
		source: VALID_DRAWIO_XML.replace('API &amp; worker', 'Before'),
		searchableText: 'Before',
		renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Before</text></svg>'
	});
	diagrams.diagrams = [original];
	const library = new DiagramLibrary(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository(),
		new InMemoryProjectRepository()
	);
	const search = new InMemorySearchRepository();
	const embeddings = new InMemoryEmbeddingClient();
	const index = new ContentIndex(search, embeddings.model);
	const controller = new DiagramStudio(
		capabilityDependencies<DiagramStudioDependencies>({
			diagramSourceNotes: notes,
			diagramFinder: library,
			diagramDraftWriter: library,
			diagramIndexer: index.diagrams,
			indexEmbeddings: embeddings,
			indexWriter: index,
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			drawioLabels: new DrawioLabelReader(),
			now: () => testNow,
			transactionRunner: new InMemoryTransactionRunner([diagrams, search])
		})
	);
	const input = {
		diagramId: original.id,
		baseEtag: diagramEtag(original),
		source: VALID_DRAWIO_XML,
		renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>API</text></svg>'
	};
	return { controller, diagrams, original, notes, search, embeddings, input };
};

const savedDiagram = (result: DiagramWriteOutcome) => {
	if (result.outcome !== 'saved') throw new Error('Expected a saved diagram');
	return result.diagram;
};

it('rejects publication without a preview', async () => {
	const { controller, input } = setup();
	await expect(
		controller.publishProjectDiagram(testActor(), { ...input, renderedSvg: '' })
	).rejects.toThrow();
});

it('rolls back the diagram and its history when embedding fails', async () => {
	const { controller, input, diagrams, original, embeddings } = setup();
	embeddings.failure = new Error('Embedding failed');
	await controller.publishProjectDiagram(testActor(), input).catch((error) => {
		if (!(error instanceof Error) || error.message !== 'Embedding failed') throw error;
		return { kind: 'failure' as const };
	});
	expect({ diagrams: diagrams.diagrams, history: diagrams.diagramRevisions }).toEqual({
		diagrams: [original],
		history: []
	});
});

it('rejects invalid XML without replacing the saved diagram', async () => {
	const { controller, input, diagrams, original } = setup();
	await controller
		.publishProjectDiagram(testActor(), { ...input, source: '<mxfile />' })
		.catch(() => ({ kind: 'failure' as const }));
	expect(diagrams.diagrams).toEqual([original]);
});

it('sanitizes the published preview', async () => {
	const { controller, input } = setup();
	const saved = await controller
		.publishProjectDiagram(testActor(), {
			...input,
			renderedSvg:
				'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>API</text></svg>'
		})
		.then(savedDiagram);
	expect(saved.renderedSvg).not.toContain('<script');
});

it('extracts searchable labels from the published XML', async () => {
	const { controller, input } = setup();
	const saved = await controller.publishProjectDiagram(testActor(), input).then(savedDiagram);
	expect(saved.searchableText).toBe('API & worker');
});

it('publishes rich, repeated and blank labels with the same policy as browser review', async () => {
	const { controller, input } = setup();
	const saved = await controller
		.publishProjectDiagram(testActor(), { ...input, source: RICH_DRAWIO_LABELS_XML })
		.then(savedDiagram);
	expect(saved.searchableText).toBe('Browser\nQueue');
});

it('publishes the submitted source as a new document revision', async () => {
	const { controller, input } = setup();
	const saved = await controller.publishProjectDiagram(testActor(), input).then(savedDiagram);
	expect({
		source: saved.source,
		current: saved.currentRevision,
		published: saved.publishedRevision
	}).toEqual({ source: input.source, current: 2, published: 2 });
});

it('makes published labels searchable with the source-note title', async () => {
	const { controller, input, search } = setup();
	await controller.publishProjectDiagram(testActor(), input);
	expect(
		(await search.searchByEmbedding(testActor(), [1, 0, 1], 10)).map(({ document }) => ({
			id: document.diagramId,
			title: document.sourceTitle
		}))
	).toEqual([{ id: input.diagramId, title: 'Diagram in Deployment decisions' }]);
});

it('rolls back publication when the source-note context is missing', async () => {
	const { controller, input, notes, diagrams, original } = setup();
	notes.notes = [];
	await controller.publishProjectDiagram(testActor(), input).catch((error) => {
		if (!(error instanceof Error) || !error.message.includes('not found')) throw error;
		return { kind: 'failure' as const };
	});
	expect({ diagrams: diagrams.diagrams, history: diagrams.diagramRevisions }).toEqual({
		diagrams: [original],
		history: []
	});
});

it('rejects another actor’s publication', async () => {
	const { controller, input } = setup();
	await expect(controller.publishProjectDiagram(testActor(2), input)).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});

it('rejects draw.io publication for a Mermaid diagram', async () => {
	const { controller, input, diagrams } = setup();
	diagrams.diagrams = [mermaidBuilder({ id: input.diagramId })];
	await expect(controller.publishProjectDiagram(testActor(), input)).rejects.toMatchObject({
		code: 'UNSUPPORTED_DIAGRAM_OPERATION'
	});
});
