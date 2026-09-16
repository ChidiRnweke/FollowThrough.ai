// Named `.svelte.spec.ts` to run in the browser project: sanitization goes
// through DOMPurify, which is inert without a real DOM.
import { describe, expect, it } from 'vitest';
import { Marked } from 'marked';
import { renderMarkdown } from './rendering';

/** The text that used to crash the app, and a parser that still crashes on it. */
const UNPARSEABLE = '- $3-4 vs $30 per 1,000 pages';

function parserThatThrowsOnDollars(): Marked {
	const parser = new Marked({ breaks: true, gfm: true });
	parser.use({
		extensions: [
			{
				name: 'inlineMath',
				level: 'inline',
				start: (src: string) => src.indexOf('$'),
				tokenizer(src: string) {
					const match = src.match(/^\$([^$]+)\$(?!\$)/);
					if (!match) return undefined;
					// No renderer for this token, so parsing throws when it is walked.
					return { type: 'inlineMath', raw: match[0], latex: match[1].trim() };
				}
			}
		]
	});
	return parser;
}

describe('renderMarkdown', () => {
	it('degrades to the raw text when the parser throws', () => {
		const result = renderMarkdown(UNPARSEABLE, parserThatThrowsOnDollars());
		expect(result).toEqual({ kind: 'failure', raw: UNPARSEABLE });
	});

	it('does not propagate the parser failure to the caller', () => {
		const render = () => renderMarkdown(UNPARSEABLE, parserThatThrowsOnDollars());
		expect(render).not.toThrow();
	});

	it('recovers on the next chunk once the text parses again', () => {
		const parser = parserThatThrowsOnDollars();
		renderMarkdown(UNPARSEABLE, parser);
		const result = renderMarkdown('plain text', parser);
		expect(result.kind).toBe('rendered');
	});

	it('treats blank content as nothing to render', () => {
		const result = renderMarkdown('   ');
		expect(result).toEqual({ kind: 'rendered', html: '' });
	});

	it('sanitizes event handlers out of inline HTML', () => {
		const result = renderMarkdown('<img src="x" alt="Unsafe" onerror="alert(1)">');
		expect(result.kind === 'rendered' && result.html.includes('onerror')).toBe(false);
	});

	it('renders an image link as an img element', () => {
		const result = renderMarkdown('![shot](/api/attachments/abc/content)');
		expect(
			result.kind === 'rendered' && result.html.includes('src="/api/attachments/abc/content"')
		).toBe(true);
	});
});
