import { describe, expect, it } from 'vitest';
import mermaid from 'mermaid';
import { createMermaidConfig, sanitizeMermaidSvg } from './mermaid-rendering';

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
