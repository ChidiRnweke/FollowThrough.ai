import { describe, expect, it } from 'vitest';
import { stripPastedStyling } from './clipboard-styles';

/**
 * Lives in the browser project rather than beside `paste.spec.ts`: the node project has no
 * `DOMParser`.
 */
describe('Pasting console output copied from a browser', () => {
	const console = '<span style="color: rgb(255, 0, 0)">Failed to load resource: 429</span>';

	it('drops the text colour', () => {
		expect(stripPastedStyling(console)).not.toContain('color');
	});

	it('keeps the message itself', () => {
		expect(stripPastedStyling(console)).toContain('Failed to load resource: 429');
	});
});

describe('Pasting text styled by its source', () => {
	it('drops a background colour', () => {
		expect(stripPastedStyling('<p style="background-color: #ffff00">warn</p>')).not.toContain(
			'background'
		);
	});

	it('drops a font size', () => {
		expect(stripPastedStyling('<span style="font-size: 28px">big</span>')).not.toContain(
			'font-size'
		);
	});

	it('drops a font family', () => {
		expect(stripPastedStyling('<span style="font-family: Courier">mono</span>')).not.toContain(
			'font-family'
		);
	});

	it('drops a legacy font colour attribute', () => {
		expect(stripPastedStyling('<font color="#f00">old</font>')).not.toContain('#f00');
	});

	it('drops source class names', () => {
		expect(stripPastedStyling('<p class="ansi-red-fg">err</p>')).not.toContain('ansi-red-fg');
	});

	it('leaves the style attribute off entirely when nothing else was in it', () => {
		expect(stripPastedStyling('<span style="color: red">x</span>')).toBe('<span>x</span>');
	});

	it('keeps a style the editor cares about', () => {
		expect(stripPastedStyling('<p style="text-align: center">mid</p>')).toContain('text-align');
	});
});

describe('Pasting content that carries meaning, not just looks', () => {
	it('keeps bold', () => {
		expect(stripPastedStyling('<p><strong>ship it</strong></p>')).toContain('<strong>');
	});

	it('keeps a link target', () => {
		expect(stripPastedStyling('<a href="https://example.com" class="x">docs</a>')).toContain(
			'href="https://example.com"'
		);
	});

	it('keeps list structure', () => {
		expect(stripPastedStyling('<ul style="color: red"><li>one</li><li>two</li></ul>')).toContain(
			'<li>one</li><li>two</li>'
		);
	});

	it('keeps table structure', () => {
		expect(stripPastedStyling('<table><tr><td style="color: red">a</td></tr></table>')).toContain(
			'<td>a</td>'
		);
	});
});

describe('Pasting a copy made in this editor', () => {
	const internal =
		'<div data-pm-slice="1 1 []"><p><span style="color: #ff8800">deliberate</span></p></div>';

	it('leaves it exactly as it was', () => {
		expect(stripPastedStyling(internal)).toBe(internal);
	});
});
