import { describe, expect, it } from 'vitest';
import mermaid from 'mermaid';
import {
	createMermaidConfig,
	mermaidExportBackground,
	mermaidTokensFor,
	sanitizeMermaidSvg
} from './mermaid-rendering';

describe('Mermaid rendering invariants', () => {
	it('preserves native SVG labels after sanitization', async () => {
		mermaid.initialize(createMermaidConfig(true));
		const { svg } = await mermaid.render(
			`mermaid-labels-${crypto.randomUUID()}`,
			'flowchart LR\n  Browser["Browser"] -->|HTTPS| Frontend["Frontend App"]'
		);
		const rendered = new DOMParser().parseFromString(sanitizeMermaidSvg(svg), 'image/svg+xml');
		expect(rendered.documentElement.textContent).toContain('Frontend App');
	});

	it('fills nodes with the muted surface rather than a mermaid-derived pastel', () => {
		expect(createMermaidConfig(false).themeVariables.primaryColor).toBe('#f4f4f0');
	});

	it('inverts the node fill in dark mode', () => {
		expect(createMermaidConfig(true).themeVariables.primaryColor).toBe('#2b2b22');
	});

	it('marks dark mode so mermaid does not derive light-mode contrasts', () => {
		expect(createMermaidConfig(true).themeVariables.darkMode).toBe(true);
	});

	it('spends the brand accent only on sequence activations', () => {
		const { themeVariables } = createMermaidConfig(false);
		const brandUses = Object.values(themeVariables).filter((value) => value === '#00786f');
		expect(brandUses).toHaveLength(1);
	});
});

describe('Choosing a palette for an exported diagram', () => {
	it('keeps the light preset when nothing is overridden', () => {
		expect(mermaidTokensFor({ base: 'light' }).muted).toBe('#f4f4f0');
	});

	it('applies an overridden colour on top of the preset', () => {
		expect(mermaidTokensFor({ base: 'light', palette: { muted: '#ffeedd' } }).muted).toBe(
			'#ffeedd'
		);
	});

	it('leaves colours it was not given at the preset', () => {
		expect(mermaidTokensFor({ base: 'dark', palette: { muted: '#ffeedd' } }).foreground).toBe(
			'#fbfbf9'
		);
	});

	it('feeds an overridden colour through to the node fill', () => {
		expect(
			createMermaidConfig({ base: 'light', palette: { muted: '#ffeedd' } }).themeVariables
				.primaryColor
		).toBe('#ffeedd');
	});

	/** The old export baked `document.body` behind the diagram, so a dark-mode
	 *  export was unusable in a light document. */
	it('paints the chosen background behind a raster export', () => {
		expect(mermaidExportBackground({ base: 'dark' })).toBe('#0c0c09');
	});

	it('paints nothing when the export is transparent', () => {
		expect(mermaidExportBackground({ base: 'dark', transparent: true })).toBeUndefined();
	});

	it('still accepts a bare dark-mode flag from the editor', () => {
		expect(createMermaidConfig(true).themeVariables.darkMode).toBe(true);
	});
});
