import { describe, expect, it } from 'vitest';
import { stripPastedStyling } from './clipboard-styles';

/**
 * Lives in the browser project rather than beside `paste.spec.ts`: the node project has no
 * `DOMParser`.
 */
describe('Pasting console output copied from a browser', () => {
	const copied =
		'<div><span style="color: rgb(255, 0, 0)">Failed to load resource: 429</span>' +
		'<table><tr><td style="color: red">a</td></tr></table>' +
		'<ul style="color: red"><li>one</li><li>two</li></ul>' +
		'<a href="https://example.com" class="x">docs</a>' +
		'<p><strong>ship it</strong></p><p style="text-align: center">mid</p>' +
		'<p class="ansi-red-fg">err</p><font color="#f00">old</font>' +
		'<span style="font-family: Courier">mono</span>' +
		'<span style="font-size: 28px">big</span>' +
		'<p style="background-color: #ffff00">warn</p></div>';

	it('keeps content and semantic formatting while removing source styling', () => {
		const cleaned = stripPastedStyling(copied);
		expect(cleaned).toContain('Failed to load resource: 429');
		expect(cleaned).toContain('<td>a</td>');
		expect(cleaned).toContain('<li>one</li><li>two</li>');
		expect(cleaned).toContain('href="https://example.com"');
		expect(cleaned).toContain('<strong>ship it</strong>');
		expect(cleaned).toContain('text-align: center');
		expect(cleaned).not.toContain('ansi-red-fg');
		expect(cleaned).not.toContain('#f00');
		expect(cleaned).not.toContain('font-family');
		expect(cleaned).not.toContain('font-size');
		expect(cleaned).not.toContain('background');
		expect(cleaned).not.toContain('color:');
	});
});

describe('Pasting a copy made in this editor', () => {
	const internal =
		'<div data-pm-slice="1 1 []"><p><span style="color: #ff8800">deliberate</span></p></div>';

	it('leaves it exactly as it was', () => {
		expect(stripPastedStyling(internal)).toBe(internal);
	});
});
