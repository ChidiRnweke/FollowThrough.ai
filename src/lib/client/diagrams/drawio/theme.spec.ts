import { describe, expect, it } from 'vitest';
import { drawioConfig, drawioThemeCss, readPalette, type DrawioPalette } from './theme';

const palette: DrawioPalette = {
	background: '#f8f8f6',
	foreground: '#1a1a18',
	card: '#ffffff',
	border: '#dcdcd6',
	muted: '#f0f0ec',
	mutedForeground: '#6b6b64',
	accent: '#f0f0ec',
	accentForeground: '#26261f',
	primary: '#0f766e',
	primaryForeground: '#f7fefc',
	fontFamily: 'Inter Variable, sans-serif'
};

describe('Dressing draw.io in the app’s surfaces', () => {
	// draw.io composes its chrome through `light-dark()`, and we only ever resolve
	// the theme the app is in — so both slots carry it and whichever one its
	// stylesheet reaches for is right.
	it('sets the light slot of a paired variable', () => {
		expect(drawioThemeCss(palette)).toContain('--ge-panel-color: #ffffff;');
	});

	it('sets the dark slot of the same pair to the same value', () => {
		expect(drawioThemeCss(palette)).toContain('--ge-dark-panel-color: #ffffff;');
	});

	it('gives the canvas the app background', () => {
		expect(drawioThemeCss(palette)).toContain('--workspace-color: #f8f8f6;');
	});

	// In dark mode draw.io resolves canvas and panel from the same slot, so the
	// canvas is stated outright or it would inherit the panel colour.
	it('states the canvas background outright as well', () => {
		expect(drawioThemeCss(palette)).toMatch(
			/\.geDiagramContainer \{\n\tbackground-color: #f8f8f6;/
		);
	});

	it('borrows the app border colour', () => {
		expect(drawioThemeCss(palette)).toContain('--border-color: #dcdcd6;');
	});

	it('borrows the app text colour', () => {
		expect(drawioThemeCss(palette)).toContain('--text-color: #1a1a18;');
	});

	// draw.io's primary button sets a background and no colour at all, so a
	// recoloured background alone left dark text sitting on teal.
	it('gives the primary button a foreground to go with its background', () => {
		expect(drawioThemeCss(palette)).toContain('color: #f7fefc;');
	});

	it('states the primary button at the specificity draw.io writes its hover at', () => {
		expect(drawioThemeCss(palette)).toContain(
			'html body.geEditor .gePrimaryBtn:hover:not([disabled])'
		);
	});

	// The editor declares its region borders with a style and a width but never a
	// colour, so its structure arrives uncoloured.
	it('colours the region separators with the app hairline', () => {
		expect(drawioThemeCss(palette)).toMatch(
			/\.geEditor\.geClassic > \.geToolbarContainer \{\n\tborder-color: #dcdcd6;/
		);
	});

	it('hides the editor’s own save, leaving the header the only one', () => {
		expect(drawioThemeCss(palette)).toContain('.gePrimaryBtn.geEmbedBtn');
	});

	it('carries draw.io’s dark hover for the primary button', () => {
		expect(drawioThemeCss(palette)).toContain('--dark-active-accent-color: #0f766e;');
	});

	it('applies the app font to the editor', () => {
		expect(drawioThemeCss(palette)).toContain('font-family: Inter Variable, sans-serif;');
	});
});

describe('The configuration draw.io is sent', () => {
	it('keeps the behavioural settings the app relies on', () => {
		expect(drawioConfig(palette).passiveScroll).toBe(true);
	});

	it('carries the theme as CSS', () => {
		expect(drawioConfig(palette).css).toContain('--workspace-color');
	});

	it('names the app font first among the defaults', () => {
		expect((drawioConfig(palette).defaultFonts as string[])[0]).toBe(palette.fontFamily);
	});

	// A shape the user draws should match the ones the agent drew.
	it('draws new shapes on the app surfaces', () => {
		expect(drawioConfig(palette).defaultVertexStyle).toMatchObject({ fillColor: '#ffffff' });
	});

	it('draws new connectors in the muted foreground', () => {
		expect(drawioConfig(palette).defaultEdgeStyle).toMatchObject({ strokeColor: '#6b6b64' });
	});

	// The grid is drawn on a canvas rather than styled, so without its own key it
	// keeps draw.io's light grey mesh over our dark surface.
	it('draws the grid in the app hairline colour', () => {
		expect(drawioConfig(palette).defaultDarkGridColor).toBe(palette.border);
	});

	it('gives the page the app background', () => {
		expect(drawioConfig(palette).defaultPageBackgroundColor).toBe(palette.background);
	});

	it('gives dark mode the app background rather than draw.io’s grey', () => {
		expect(drawioConfig(palette).darkColor).toBe('#f8f8f6');
	});
});

describe('Reading the palette', () => {
	it('resolves every colour through the supplied resolver', () => {
		const resolved = readPalette((token) => `resolved${token}`, 'Font');
		expect(resolved.background).toBe('resolved--background');
	});

	it('takes the font family as given', () => {
		expect(readPalette(() => '#000000', 'Font').fontFamily).toBe('Font');
	});
});
