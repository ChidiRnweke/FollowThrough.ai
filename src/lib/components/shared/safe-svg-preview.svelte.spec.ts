import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SafeSvgPreview from './safe-svg-preview.svelte';

describe('Sanitized SVG preview rendering', () => {
	it('renders the preview as an image resource', async () => {
		const screen = await render(SafeSvgPreview, {
			svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Architecture</text></svg>',
			alt: 'Architecture preview'
		});
		await expect.element(screen.getByRole('img', { name: 'Architecture preview' })).toBeVisible();
	});
});
