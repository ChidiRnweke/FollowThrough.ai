import { diagramEtag, type DiagramWriteOutcome } from '$lib/models/diagrams';
import { createDiagramServices } from '$lib/server/factories/capabilities/diagrams-capability-factory';
import {
	DrawioLabelReader,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import { DiagramEditingService } from '$lib/services/diagrams/editing';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
import { DiagramLifecycleService } from '$lib/services/diagrams/trash';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	drawioBuilder,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { RICH_DRAWIO_LABELS_XML, VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { noteBuilder, testActor, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';

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
	const library = createDiagramServices(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository(),
		new InMemoryProjectRepository()
	);
	const search = new InMemorySearchRepository();
	const embeddings = new InMemoryEmbeddingClient();
	const index = createContentIndex(search, embeddings.model);
	const controller = new DiagramStudio(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<DiagramStudioDependencies>({
			...agentToolResultsFixture(),
			diagramEditing: new DiagramEditingService(),
			diagramLifecycle: new DiagramLifecycleService(),
			diagramSourceNotes: notes,
			diagramFinder: library.finder,
			diagramTrash: library.lifecycle,
			diagramDraftWriter: library.draftWriter,
			diagramIndexer: index,
			indexEmbeddings: embeddings,
			indexWriter: index,
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			diagramLabelPresentation: new DiagramLabelPresentationService(),
			drawioLabels: new DrawioLabelReader(),
			now: () => testNow,
			transactionRunner: new InMemoryTransactionRunner([diagrams, search])
		})
	);
	const input = {
		diagramId: original.id,
		baseEtag: diagramEtag(original.id, original.currentRevision),
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

	expect({
		source: saved.source,
		current: saved.currentRevision,
		published: saved.publishedRevision
	}).toEqual({ source: input.source, current: 2, published: 2 });
});

it('publishes rich, repeated and blank labels with the same policy as browser review', async () => {
	const { controller, input } = setup();
	const saved = await controller
		.publishProjectDiagram(testActor(), { ...input, source: RICH_DRAWIO_LABELS_XML })
		.then(savedDiagram);
	expect(saved.searchableText).toBe('Browser\nQueue');
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

it('publishes a standalone diagram without requiring a source-note lookup', async () => {
	const { controller, input, notes, diagrams, original, search } = setup();
	diagrams.diagrams = [{ ...original, sourceNoteId: undefined }];
	notes.notes = [];
	await controller.publishProjectDiagram(testActor(), input);
	expect(search.documents.map(({ document }) => document.sourceTitle)).toEqual([
		'Diagram: Architecture'
	]);
});

it('removes empty diagram chunks without requiring unavailable source-note context', async () => {
	const { controller, input, notes, search } = setup();
	const published = await controller.publishProjectDiagram(testActor(), input).then(savedDiagram);
	notes.notes = [];
	await controller.publishProjectDiagram(testActor(), {
		...input,
		baseEtag: diagramEtag(published.id, published.currentRevision),
		source: VALID_DRAWIO_XML.replace('API &amp; worker', '   ')
	});
	expect(search.documents).toEqual([]);
});

it('removes archived diagram chunks without requiring unavailable source-note context', async () => {
	const { controller, input, notes, search } = setup();
	await controller.publishProjectDiagram(testActor(), input);
	notes.notes = [];
	await controller.archiveProjectDiagram(testActor(), { diagramId: input.diagramId });
	expect(search.documents).toEqual([]);
});
