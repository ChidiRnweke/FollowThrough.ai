import { describe, expect, it } from 'vitest';
import { DrawioLabelExtractor, DrawioSvgSanitizer, DrawioXmlValidator } from './drawio';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

describe('Untrusted draw.io XML invariants', () => {
	it('accepts uncompressed mxfile graph XML', () => {
		expect(new DrawioXmlValidator().validate(VALID_DRAWIO_XML)).toBe(VALID_DRAWIO_XML);
	});

	it('accepts the HTML entities draw.io puts in rich-text labels', () => {
		expect(
			new DrawioXmlValidator().validate(
				VALID_DRAWIO_XML.replace('</root>', '<mxCell id="e" parent="1" value="A&nbsp;B"/></root>')
			)
		).toContain('&nbsp;');
	});

	it('rejects an entity name with no HTML meaning', () => {
		expect(() =>
			new DrawioXmlValidator().validate(
				VALID_DRAWIO_XML.replace(
					'</root>',
					'<mxCell id="e" parent="1" value="&bogusname;"/></root>'
				)
			)
		).toThrow('malformed');
	});

	it('rejects malformed XML', () => {
		expect(() => new DrawioXmlValidator().validate('<mxfile>')).toThrow('malformed');
	});

	// The failure this check exists for: a model that escapes its own output sends
	// a document that is one long text node, and the parser could only answer
	// "text data outside of root node" at 1:1 — true, and no help to anyone.
	it('says so when the whole document arrived HTML-escaped', () => {
		expect(() =>
			new DrawioXmlValidator().validate(
				VALID_DRAWIO_XML.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
			)
		).toThrow('HTML-escaped');
	});

	it('still accepts escaped markup inside a label', () => {
		expect(
			new DrawioXmlValidator().validate(
				VALID_DRAWIO_XML.replace(
					'</root>',
					'<mxCell id="e" parent="1" value="&lt;b&gt;A&lt;/b&gt;"/></root>'
				)
			)
		).toContain('&lt;b&gt;');
	});

	it('rejects document type declarations', () => {
		expect(() => new DrawioXmlValidator().validate(`<!DOCTYPE mxfile>${VALID_DRAWIO_XML}`)).toThrow(
			'declarations'
		);
	});

	it('rejects script elements', () => {
		expect(() =>
			new DrawioXmlValidator().validate(VALID_DRAWIO_XML.replace('</root>', '<script/></root>'))
		).toThrow('scripts');
	});

	it('rejects event handlers', () => {
		expect(() =>
			new DrawioXmlValidator().validate(VALID_DRAWIO_XML.replace('id="2"', 'id="2" onclick="x"'))
		).toThrow('event handlers');
	});

	it('rejects encoded scripts in cell values', () => {
		expect(() =>
			new DrawioXmlValidator().validate(
				VALID_DRAWIO_XML.replace('API &amp; worker', '&lt;script&gt;alert(1)&lt;/script&gt;')
			)
		).toThrow('scripts');
	});

	it('rejects encoded event handlers in cell values', () => {
		expect(() =>
			new DrawioXmlValidator().validate(
				VALID_DRAWIO_XML.replace('API &amp; worker', '&lt;img onerror=&quot;x&quot;&gt;')
			)
		).toThrow('event handlers');
	});

	it('rejects unsafe URLs', () => {
		expect(() =>
			new DrawioXmlValidator().validate(
				VALID_DRAWIO_XML.replace('id="2"', 'id="2" href="javascript:alert(1)"')
			)
		).toThrow('unsafe URL');
	});

	it('rejects missing cell references', () => {
		expect(() =>
			new DrawioXmlValidator().validate(VALID_DRAWIO_XML.replace('target="2"', 'target="99"'))
		).toThrow('invalid target');
	});

	it('rejects non-finite geometry', () => {
		expect(() =>
			new DrawioXmlValidator().validate(VALID_DRAWIO_XML.replace('width="120"', 'width="NaN"'))
		).toThrow('must be finite');
	});
});

describe('Draw.io preview and retrieval invariants', () => {
	it('removes scripts from exported SVG previews', () => {
		const result = new DrawioSvgSanitizer().sanitize(
			'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text>Safe</text></svg>'
		);
		expect(result).not.toContain('<script');
	});

	it('removes external links from exported SVG previews', () => {
		const result = new DrawioSvgSanitizer().sanitize(
			'<svg xmlns="http://www.w3.org/2000/svg"><a href="https://tracker.example"><text>Safe</text></a></svg>'
		);
		expect(result).not.toContain('tracker.example');
	});

	it('removes external paint URLs from exported SVG previews', () => {
		const result = new DrawioSvgSanitizer().sanitize(
			'<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://tracker.example/pixel)" /></svg>'
		);
		expect(result).not.toContain('tracker.example');
	});

	it('extracts searchable labels from draw.io cells', () => {
		expect(new DrawioLabelExtractor().extract(VALID_DRAWIO_XML)).toBe('API & worker');
	});
});
