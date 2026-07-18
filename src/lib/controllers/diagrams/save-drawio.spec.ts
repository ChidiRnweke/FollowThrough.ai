import { describe, expect, it } from 'vitest';
import { DefaultDiagramsController, type DiagramsDependencies } from './controller';
import {
	drawioBuilder,
	InMemoryDiagrams,
	mermaidBuilder
} from '$lib/testing/fakes/in-memory-diagram-skills';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import { testActor, testNoteId } from '$lib/testing/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/fixtures/drawio';
import {
	DrawioDiagramTextExtractor,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/domain/drawio-content';

const CLEAN_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>API</text></svg>';

const setup = (kind: 'drawio' | 'mermaid' = 'drawio') => {
	const diagrams = new InMemoryDiagrams();
	const diagram =
		kind === 'drawio' ? drawioBuilder({ source: VALID_DRAWIO_XML }) : mermaidBuilder();
	diagrams.diagrams = [diagram];
	const controller = new DefaultDiagramsController({
		diagramFinder: diagrams,
		diagramWriter: diagrams,
		diagramIndexer: diagrams,
		drawioXmlValidator: new DrawioXmlValidator(),
		drawioSvgSanitizer: new DrawioSvgSanitizer(),
		drawioTextExtractor: new DrawioDiagramTextExtractor(),
		transactionRunner: new InMemoryTransactionRunner([])
	} as unknown as DiagramsDependencies);
	return { controller, diagrams, diagram };
};

const input = (
	overrides: Partial<Parameters<DefaultDiagramsController['saveDrawio']>[1]> = {}
) => ({
	noteId: testNoteId(),
	diagramId: drawioBuilder().id,
	source: VALID_DRAWIO_XML,
	renderedSvg: CLEAN_SVG,
	...overrides
});

describe('Draw.io editor ownership invariants', () => {
	it('hides a diagram requested through a different note', async () => {
		const { controller } = setup();
		await expect(
			controller.getDrawio(testActor(), input({ noteId: testNoteId(2) }))
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('hides a diagram owned by a different actor', async () => {
		const { controller } = setup();
		await expect(controller.getDrawio(testActor(2), input())).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('rejects editing a Mermaid diagram in the draw.io editor', async () => {
		const { controller } = setup('mermaid');
		await expect(
			controller.getDrawio(testActor(), { ...input(), diagramId: mermaidBuilder().id })
		).rejects.toMatchObject({ code: 'UNSUPPORTED_DIAGRAM_OPERATION' });
	});
});

describe('Last-save-wins draw.io persistence invariants', () => {
	it('rejects invalid XML without replacing current state', async () => {
		const { controller, diagrams } = setup();
		await controller
			.saveDrawio(testActor(), input({ source: '<mxfile />' }))
			.catch(() => undefined);
		expect(diagrams.diagrams[0]?.source).toBe(VALID_DRAWIO_XML);
	});

	it('sanitizes the stored SVG preview', async () => {
		const { controller } = setup();
		const result = await controller.saveDrawio(
			testActor(),
			input({
				renderedSvg:
					'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>API</text></svg>'
			})
		);
		expect(result.diagram.renderedSvg).not.toContain('<script');
	});

	it('extracts searchable labels from the saved XML', async () => {
		const { controller } = setup();
		const result = await controller.saveDrawio(testActor(), input());
		expect(result.diagram.searchableText).toBe('API & worker');
	});

	it('replaces the current diagram source', async () => {
		const { controller } = setup();
		const replacement = VALID_DRAWIO_XML.replace('API &amp; worker', 'Queue');
		const result = await controller.saveDrawio(testActor(), input({ source: replacement }));
		expect(result.diagram.source).toBe(replacement);
	});

	it('refreshes retrieval indexing after save', async () => {
		const { controller, diagrams } = setup();
		await controller.saveDrawio(testActor(), input());
		expect(diagrams.indexedIds).toEqual([drawioBuilder().id]);
	});
});
