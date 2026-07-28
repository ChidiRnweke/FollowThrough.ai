import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { marked } from 'marked';
import ChatMarkdown from './chat-markdown.svelte';

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
