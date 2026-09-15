import { describe, expect, it } from 'vitest';
import { prepareExport } from './export-preparation';
import type { ProseMirrorDocument } from '$lib/models/notes';
const document: ProseMirrorDocument = {
	type: 'doc',
	content: [{ type: 'image', attrs: { src: '/api/attachments/file/content' } }]
};
describe('shared export preparation', () => {
	it('resolves attachment images for every renderer', async () => {
		const prepared = await prepareExport({
			title: 'Export',
			notes: [{ title: 'Note', document }],
			imageResolver: async () => 'data:image/png;base64,aGVsbG8='
		});
		expect(prepared.images.get('/api/attachments/file/content')).toBe(
			'data:image/png;base64,aGVsbG8='
		);
	});
	it('keeps unavailable images absent so renderers report them', async () => {
		const prepared = await prepareExport({
			title: 'Export',
			notes: [{ title: 'Note', document }],
			imageResolver: async () => undefined
		});
		expect(prepared.images.has('/api/attachments/file/content')).toBe(false);
	});
	it('prefers a supplied raster while retaining the diagram display size', async () => {
		const prepared = await prepareExport({
			title: 'Export',
			notes: [],
			diagramPngs: { diagram: 'data:image/png;base64,aGVsbG8=' },
			diagramSvgs: { diagram: '<svg viewBox="0 0 400 200"/>' },
			diagramSizes: { diagram: { width: 200, height: 100 } }
		});
		expect(prepared.diagrams.get('diagram')).toEqual({
			kind: 'raster',
			data: 'data:image/png;base64,aGVsbG8=',
			size: { width: 200, height: 100 }
		});
	});
	it('keeps a vector available for formats that support it', async () => {
		const prepared = await prepareExport({
			title: 'Export',
			notes: [],
			diagramSvgs: { diagram: '<svg viewBox="0 0 400 200"/>' }
		});
		expect(prepared.diagrams.get('diagram')).toEqual({
			kind: 'vector',
			data: '<svg viewBox="0 0 400 200"/>',
			size: { width: 400, height: 200 }
		});
	});
});
