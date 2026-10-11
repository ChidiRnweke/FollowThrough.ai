import { describe, expect, it } from 'vitest';
import { MermaidThemeService } from './mermaid-theme';
const themes = new MermaidThemeService();

describe('Mermaid theme rules', () => {
	it('fills nodes with the muted surface rather than a mermaid-derived pastel', () => {
		expect(themes.resolve(false).config.themeVariables.primaryColor).toBe('#f4f4f0');
	});

	it('inverts the node fill in dark mode', () => {
		expect(themes.resolve(true).config.themeVariables.primaryColor).toBe('#2b2b22');
	});

	it('marks dark mode so mermaid does not derive light-mode contrasts', () => {
		expect(themes.resolve(true).config.themeVariables.darkMode).toBe(true);
	});

	it('spends the brand accent only on sequence activations', () => {
		const { themeVariables } = themes.resolve(false).config;
		const brandUses = Object.values(themeVariables).filter((value) => value === '#00786f');
		expect(brandUses).toHaveLength(1);
	});

	it('applies an overridden colour on top of the preset', () => {
		expect(themes.resolve({ base: 'light', palette: { muted: '#ffeedd' } }).tokens.muted).toBe(
			'#ffeedd'
		);
	});

	it('feeds an overridden colour through to the node fill', () => {
		expect(
			themes.resolve({ base: 'light', palette: { muted: '#ffeedd' } }).config.themeVariables
				.primaryColor
		).toBe('#ffeedd');
	});
});
