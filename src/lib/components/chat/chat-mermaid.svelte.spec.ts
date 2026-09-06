import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ChatMermaid from './chat-mermaid.svelte';

const FLOWCHART = 'flowchart LR\nA[First] --> B[Second]';

it('opens the diagram at full size when it is clicked', async () => {
	const screen = await render(ChatMermaid, { source: FLOWCHART });
	await screen.getByRole('button', { name: 'Open diagram at full size' }).click();
	await vi.waitFor(() => {
		expect(
			document.querySelectorAll('[aria-label="Mermaid diagram at full size"] svg').length
		).toBe(1);
	});
});

it('offers no way to enlarge a diagram that could not be drawn', async () => {
	const screen = await render(ChatMermaid, { source: 'not a diagram' });
	await vi.waitFor(() => {
		if (!screen.container.textContent?.includes('could not be drawn'))
			throw new Error('Waiting for the failure state');
		expect(screen.container.querySelector('button[aria-label="Open diagram at full size"]')).toBe(
			null
		);
	});
});
