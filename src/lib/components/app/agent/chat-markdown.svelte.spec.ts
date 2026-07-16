import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
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
});
