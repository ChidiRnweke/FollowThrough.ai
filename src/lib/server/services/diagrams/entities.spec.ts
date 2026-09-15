import { describe, expect, it } from 'vitest';
import { DrawioXmlValidator } from './drawio';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
describe('draw.io named character references', () => {
	it.each([
		'&nbsp;',
		'&copy;',
		'&euro;',
		'&NotEqualTilde;',
		'&CounterClockwiseContourIntegral;',
		'&amp;',
		'&lt;',
		'&quot;'
	])('accepts the complete reference %s without changing stored XML', (reference) => {
		const xml = VALID_DRAWIO_XML.replace(
			'</root>',
			`<mxCell id="entity" parent="1" value="A${reference}B"/></root>`
		);
		expect(new DrawioXmlValidator().validate(xml)).toBe(xml);
	});
	it('rejects an unknown name even when its prefix is a known HTML entity', () => {
		const xml = VALID_DRAWIO_XML.replace(
			'</root>',
			'<mxCell id="entity" parent="1" value="&notARealEntity;"/></root>'
		);
		expect(() => new DrawioXmlValidator().validate(xml)).toThrow('malformed');
	});
});
