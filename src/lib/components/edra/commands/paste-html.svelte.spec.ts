import { describe, expect, it } from 'vitest';
import { htmlCarriesStructure } from './paste';

/**
 * A `.md` file copied out of VS Code arrives with a `text/html` flavour — a styled
 * `div`/`span` tree — which used to send the paste down ProseMirror's HTML parser and land
 * the Markdown as preformatted text.
 *
 * Browser-side because the predicate reads the HTML with `DOMParser`.
 */
describe('Deciding whether pasted HTML carries structure', () => {
	it.each([
		[
			'a VS Code copy',
			'<div style="color:#d4d4d4;font-family:Menlo;white-space:pre;"><div><span style="color:#569cd6;"># Release notes</span></div><div><span>- one</span></div></div>'
		],
		['a terminal copy', '<pre style="font-family:monospace">$ pnpm check</pre>'],
		['a bare styled span', '<span style="color:red">- one\n- two</span>'],
		['plain text with a line break', 'first<br>second']
	])('treats %s as text', (_label, html) => {
		expect(htmlCarriesStructure(html)).toBe(false);
	});

	it.each([
		['a heading', '<h1>Release notes</h1>'],
		['a list', '<ul><li>one</li><li>two</li></ul>'],
		['a table', '<table><tr><td>Name</td></tr></table>'],
		['emphasis', '<p>this is <strong>important</strong></p>'],
		['a link', '<p>see <a href="https://example.com">the docs</a></p>'],
		['an image', '<div><img src="https://example.com/a.png" /></div>'],
		['a blockquote', '<blockquote>quoted</blockquote>']
	])('defers to the HTML parser for %s', (_label, html) => {
		expect(htmlCarriesStructure(html)).toBe(true);
	});

	it('defers to the HTML parser for a copy out of this editor', () => {
		expect(htmlCarriesStructure('<div data-pm-slice="1 1 []"><p># not a heading</p></div>')).toBe(
			true
		);
	});
});
