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

it('renders multiple Mermaid diagrams in a message', async () => {
	const screen = await render(ChatMarkdown, {
		content:
			'```mermaid\nflowchart LR\nA[First] --> B[Second]\n```\n\nBetween\n\n~~~mermaid\nsequenceDiagram\nAlice->>Bob: Hello\n~~~'
	});
	await vi.waitFor(() => {
		expect(screen.container.querySelectorAll('[aria-label="Mermaid diagram"] svg').length).toBe(2);
	});
});

it('renders a streamed diagram only once its fence closes', async () => {
	const content = '```mermaid\nflowchart LR\nA --> B\n';
	const screen = await render(ChatMarkdown, { content });
	await screen.rerender({ content: content + '```' });
	await expect.element(screen.getByRole('img', { name: 'Mermaid diagram' })).toBeVisible();
});

it('keeps incomplete Mermaid fences as code', async () => {
	const screen = await render(ChatMarkdown, { content: '```mermaid\nflowchart LR\nA -->' });
	await expect.element(screen.getByText('flowchart LR\nA -->', { exact: true })).toBeVisible();
});

it('shows the source and explanation when a diagram is invalid', async () => {
	const screen = await render(ChatMarkdown, { content: '```mermaid\nnot a diagram\n```' });
	await vi.waitFor(() => {
		expect(screen.container.textContent?.replace(/\s+/g, ' ').trim()).toContain(
			'This diagram could not be drawn. Its source is shown below. not a diagram'
		);
	});
});

it('recovers when an invalid diagram is replaced with valid source', async () => {
	const screen = await render(ChatMarkdown, { content: '```mermaid\nnot a diagram\n```' });
	await vi.waitFor(() => {
		if (!screen.container.textContent?.includes('could not be drawn'))
			throw new Error('Waiting for failure');
	});
	await screen.rerender({ content: '```mermaid\nflowchart LR\nA --> B\n```' });
	await expect.element(screen.getByRole('img', { name: 'Mermaid diagram' })).toBeVisible();
});

it('does not render Mermaid examples nested in a longer code fence', async () => {
	const screen = await render(ChatMarkdown, {
		content: '````markdown\n```mermaid\nflowchart LR\nA --> B\n```\n````'
	});
	await expect.element(screen.getByText(/```mermaid/)).toBeVisible();
});

it('preserves Markdown reference definitions when segmenting chat', async () => {
	const screen = await render(ChatMarkdown, {
		content: '[guide]: https://example.com/guide\n\nRead the [guide].'
	});
	await expect
		.element(screen.getByRole('link', { name: 'guide' }))
		.toHaveAttribute('href', 'https://example.com/guide');
});
