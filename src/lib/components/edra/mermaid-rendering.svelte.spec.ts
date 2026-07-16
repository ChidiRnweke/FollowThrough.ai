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
});
