import { describe, expect, it } from 'vitest';
import { createMermaidDiagrams } from '$lib/factories/diagrams/mermaid';
const diagrams = createMermaidDiagrams();

describe('Mermaid browser rendering', () => {
	it('preserves native SVG labels after sanitization', async () => {
		const svg = await diagrams.render(
			`mermaid-labels-${crypto.randomUUID()}`,
			'flowchart LR\n  Browser["Browser"] -->|HTTPS| Frontend["Frontend App"]',
			true
		);
		const rendered = new DOMParser().parseFromString(svg, 'image/svg+xml');
		expect(rendered.documentElement.textContent).toContain('Frontend App');
	});

	it('paints the chosen background behind a raster export', () => {
		expect(diagrams.appearance({ base: 'dark' }).background).toBe('#0c0c09');
	});

	it('paints nothing when the export is transparent', () => {
		expect(diagrams.appearance({ base: 'dark', transparent: true }).background).toBeUndefined();
	});
});
