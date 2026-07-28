import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { Marked, marked } from 'marked';
import ChatMarkdown from './chat-markdown.svelte';
import { renderChatMarkdown } from './chat-markdown';

describe('chat markdown', () => {
	it('renders Markdown structure', async () => {
		const screen = await render(ChatMarkdown, { content: '## Rendered title' });
		await expect.element(screen.getByRole('heading', { name: 'Rendered title' })).toBeVisible();
	});

	it('sanitizes generated HTML before rendering it', async () => {
		const screen = await render(ChatMarkdown, {
			content: '<img src="x" alt="Unsafe image" onerror="alert(1)">'
		});
		await vi.waitFor(() => {
			const image = screen.container.querySelector('img');
			if (!image) throw new Error('The Markdown image has not rendered yet');
			expect(image.hasAttribute('onerror')).toBe(false);
		});
	});

	it('renders dollar amounts even when the global marked instance was polluted', async () => {
		// Reproduces the crash caused by @tiptap/markdown registering a
		// tokenizer-only "inlineMath" extension on the global marked singleton.
		marked.use({
			extensions: [
				{
					name: 'inlineMath',
					level: 'inline',
					start: (src: string) => src.indexOf('$'),
					tokenizer(src: string) {
						const match = src.match(/^\$([^$]+)\$(?!\$)/);
						if (!match) return undefined;
						return { type: 'inlineMath', raw: match[0], latex: match[1].trim() };
					}
				}
			]
		});
		const screen = await render(ChatMarkdown, {
			content: 'Costs range from $4–13 vs $30 per 1,000 pages'
		});
		await expect.element(screen.getByText(/Costs range from/)).toBeVisible();
	});
});

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

describe('renderChatMarkdown', () => {
	it('degrades to the raw text when the parser throws', () => {
		const result = renderChatMarkdown(UNPARSEABLE, parserThatThrowsOnDollars());
		expect(result).toEqual({ ok: false, raw: UNPARSEABLE });
	});

	it('does not propagate the parser failure to the caller', () => {
		const render = () => renderChatMarkdown(UNPARSEABLE, parserThatThrowsOnDollars());
		expect(render).not.toThrow();
	});

	it('recovers on the next chunk once the text parses again', () => {
		const parser = parserThatThrowsOnDollars();
		renderChatMarkdown(UNPARSEABLE, parser);
		const result = renderChatMarkdown('plain text', parser);
		expect(result.ok).toBe(true);
	});

	it('treats blank content as nothing to render', () => {
		const result = renderChatMarkdown('   ');
		expect(result).toEqual({ ok: true, html: '' });
	});
});
