import { describe, expect, it } from 'vitest';
import type { ConversationId } from '$lib/models/agent';
import type { Diagram } from '$lib/models/diagrams';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import {
	DrawioLabelExtractor,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

const CONVERSATION = '00000000-0000-4000-8000-0000000000c1' as ConversationId;

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const library = new DiagramLibrary(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository()
	);
	const indexed: Diagram[] = [];
	const controller = new DiagramStudio(
		capabilityDependencies<DiagramStudioDependencies>({
			transactionRunner: { run: <T>(work: () => Promise<T>): Promise<T> => work() },
			now: () => '2026-01-01T00:00:00.000Z' as Diagram['createdAt'],
			diagramConversations: library,
			diagramWriter: library,
			diagramLister: library,
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			drawioTextExtractor: {
				extract: async (diagram: { readonly source: string }) =>
					new DrawioLabelExtractor().extract(diagram.source)
			},
			diagramIndexer: {
				index: async (_actor, diagram) => {
					indexed.push(diagram);
				}
			}
		})
	);
	return { controller, diagrams, indexed };
};

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><title>x</title></svg>';

const draft = (overrides: Record<string, unknown> = {}) => ({
	projectId: testProjectId(),
	conversationId: CONVERSATION,
	source: VALID_DRAWIO_XML,
	renderedSvg: SVG,
	title: 'Ingest pipeline',
	...overrides
});

describe('Studio keeping invariants', () => {
	it('creates the diagram a conversation was drafting', async () => {
		const { controller, diagrams } = setup();
		await controller.keepStudioDiagram(testActor(), draft());
		expect(diagrams.diagrams).toHaveLength(1);
	});

	it('owns the diagram by its project rather than by a note', async () => {
		const { controller } = setup();
		const result = await controller.keepStudioDiagram(testActor(), draft());
		expect(result.diagram.sourceNoteId).toBeUndefined();
	});

	// A reconnect or an event replay re-sends the keeping. Without this, the
	// user ends up with two diagrams for one conversation.
	it('does not create a second diagram when a keeping is replayed', async () => {
		const { controller, diagrams } = setup();
		await controller.keepStudioDiagram(testActor(), draft());
		await controller.keepStudioDiagram(testActor(), draft());
		expect(diagrams.diagrams).toHaveLength(1);
	});

	it('reports a replayed keeping as not created', async () => {
		const { controller } = setup();
		await controller.keepStudioDiagram(testActor(), draft());
		const replay = await controller.keepStudioDiagram(testActor(), draft());
		expect(replay.created).toBe(false);
	});

	// Promotion is the conversion to draw.io: a Mermaid draft never becomes a row,
	// so a kept diagram is always draw.io.
	it('keeps to draw.io', async () => {
		const { controller } = setup();
		const result = await controller.keepStudioDiagram(testActor(), draft());
		expect(result.diagram.kind).toBe('drawio');
	});

	it('rejects a draft whose draw.io XML is not valid', async () => {
		const { controller } = setup();
		await expect(
			controller.keepStudioDiagram(testActor(), draft({ source: '<mxfile />' }))
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	// The preview is the SVG the embed exported on save, and it is the only one a
	// draw.io diagram will ever have — so a keeping cannot proceed without it.
	it('keeps the preview the embed exported', async () => {
		const { controller } = setup();
		const result = await controller.keepStudioDiagram(testActor(), draft());
		expect(result.diagram.renderedSvg).toContain('<svg');
	});

	it('refuses a keeping carrying no preview', async () => {
		const { controller } = setup();
		await expect(
			controller.keepStudioDiagram(testActor(), draft({ renderedSvg: '' }))
		).rejects.toThrow();
	});

	it('indexes the diagram it kept', async () => {
		const { controller, indexed } = setup();
		const result = await controller.keepStudioDiagram(testActor(), draft());
		expect(indexed.map((item) => item.id)).toEqual([result.diagram.id]);
	});

	it('extracts searchable labels from the kept draw.io XML', async () => {
		const { controller } = setup();
		const result = await controller.keepStudioDiagram(testActor(), draft());
		expect(result.diagram.searchableText.length).toBeGreaterThan(0);
	});
});
