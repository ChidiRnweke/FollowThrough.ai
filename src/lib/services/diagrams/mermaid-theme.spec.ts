import { describe, expect, it } from 'vitest';
import { createMermaidConfig, mermaidTokensFor } from './mermaid-theme';

describe('Mermaid theme rules', () => {
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

	it('still accepts a bare dark-mode flag from the editor', () => {
		expect(createMermaidConfig(true).themeVariables.darkMode).toBe(true);
	});
});
