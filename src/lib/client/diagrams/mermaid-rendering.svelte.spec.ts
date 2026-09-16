import { describe, expect, it } from 'vitest';
import mermaid from 'mermaid';
import {
	createMermaidConfig,
	mermaidExportBackground,
	sanitizeMermaidSvg
} from './mermaid-rendering';

describe('Mermaid browser rendering', () => {
	it('preserves native SVG labels after sanitization', async () => {
		mermaid.initialize(createMermaidConfig(true));
		const { svg } = await mermaid.render(
			`mermaid-labels-${crypto.randomUUID()}`,
			'flowchart LR\n  Browser["Browser"] -->|HTTPS| Frontend["Frontend App"]'
		);
		const rendered = new DOMParser().parseFromString(sanitizeMermaidSvg(svg), 'image/svg+xml');
		expect(rendered.documentElement.textContent).toContain('Frontend App');
	});

	it('paints the chosen background behind a raster export', () => {
		expect(mermaidExportBackground({ base: 'dark' })).toBe('#0c0c09');
	});

	it('paints nothing when the export is transparent', () => {
		expect(mermaidExportBackground({ base: 'dark', transparent: true })).toBeUndefined();
	});
});
