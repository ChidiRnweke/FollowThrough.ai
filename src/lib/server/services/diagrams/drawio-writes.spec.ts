import { describe, expect, it } from 'vitest';
import { DrawioWrites } from './drawio-writes';
import { DrawioDiagramTextExtractor, DrawioSvgSanitizer, DrawioXmlValidator } from './drawio';
import {
	drawioBuilder,
	InMemoryDiagrams
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

const CLEAN_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text>Ingest</text></svg>';

const setup = () => {
	const diagrams = new InMemoryDiagrams();
	const current = drawioBuilder({ source: '<mxfile><diagram/></mxfile>' });
	diagrams.diagrams = [current];
	return {
		diagrams,
		current,
		writes: new DrawioWrites(
			diagrams,
			new DrawioXmlValidator(),
			new DrawioSvgSanitizer(),
			new DrawioDiagramTextExtractor(),
			diagrams
		)
	};
};

const revision = { source: VALID_DRAWIO_XML, renderedSvg: CLEAN_SVG };

describe('Writing a new version of a draw.io diagram', () => {
	it('stores the validated source', async () => {
		const { writes, current } = setup();
		const diagram = await writes.write(testActor(), current, revision);
		expect(diagram.source).toContain('mxfile');
	});

	it('stores the preview the embed exported', async () => {
		const { writes, current } = setup();
		const diagram = await writes.write(testActor(), current, revision);
		expect(diagram.renderedSvg).toContain('<svg');
	});

	// The step most easily forgotten by a caller writing this sequence by hand,
	// and the one whose absence is invisible: the diagram keeps searching as the
	// version it used to be.
	it('re-extracts the searchable text from the new source', async () => {
		const { writes, current } = setup();
		const diagram = await writes.write(testActor(), current, revision);
		expect(diagram.searchableText).not.toBe(current.searchableText);
	});

	it('re-indexes the diagram it wrote', async () => {
		const { writes, current, diagrams } = setup();
		const diagram = await writes.write(testActor(), current, revision);
		expect(diagrams.indexedIds).toEqual([diagram.id]);
	});

	it('refuses source that is not valid draw.io XML', async () => {
		const { writes, current } = setup();
		await expect(
			writes.write(testActor(), current, { source: 'not xml', renderedSvg: CLEAN_SVG })
		).rejects.toThrow();
	});

	it('refuses a revision with no preview, which could never gain one', async () => {
		const { writes, current } = setup();
		await expect(
			writes.write(testActor(), current, { source: VALID_DRAWIO_XML, renderedSvg: '' })
		).rejects.toThrow();
	});
});
