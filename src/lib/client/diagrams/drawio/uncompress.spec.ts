import { describe, expect, it } from 'vitest';
import { uncompressDrawioXml } from './uncompress';

const MODEL =
	'<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0" value="Browser"/></root></mxGraphModel>';

const compress = async (xml: string): Promise<string> => {
	const deflated = await new Response(
		new Blob([new TextEncoder().encode(encodeURIComponent(xml))])
			.stream()
			.pipeThrough(new CompressionStream('deflate-raw'))
	).arrayBuffer();
	return btoa(String.fromCharCode(...new Uint8Array(deflated)));
};

describe('uncompressDrawioXml', () => {
	it('inflates a compressed diagram body', async () => {
		const xml = `<mxfile><diagram id="a" name="Page-1">${await compress(MODEL)}</diagram></mxfile>`;
		expect(await uncompressDrawioXml(xml)).toContain('<mxGraphModel>');
	});

	it('leaves an already uncompressed document untouched', async () => {
		const xml = `<mxfile><diagram id="a">${MODEL}</diagram></mxfile>`;
		expect(await uncompressDrawioXml(xml)).toBe(xml);
	});

	it('keeps the diagram attributes when inflating', async () => {
		const xml = `<mxfile><diagram id="a" name="Page-1">${await compress(MODEL)}</diagram></mxfile>`;
		expect(await uncompressDrawioXml(xml)).toContain('<diagram id="a" name="Page-1">');
	});

	it('inflates every page of a multi-page document', async () => {
		const body = await compress(MODEL);
		const xml = `<mxfile><diagram id="a">${body}</diagram><diagram id="b">${body}</diagram></mxfile>`;
		expect((await uncompressDrawioXml(xml)).match(/<mxGraphModel>/g)).toHaveLength(2);
	});

	it('leaves a body it cannot inflate for the server to reject', async () => {
		const xml = '<mxfile><diagram id="a">not-base64-at-all!!</diagram></mxfile>';
		expect(await uncompressDrawioXml(xml)).toBe(xml);
	});
});
