import { describe, expect, it } from 'vitest';
import { drawioConfig, type DrawioPalette } from './theme';

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

describe('The configuration draw.io is sent', () => {
	it('offers the app font first when drawing text', () => {
		expect(drawioConfig(palette).defaultFonts[0]).toBe('Inter Variable, sans-serif');
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
		expect(drawioConfig(palette).defaultDarkGridColor).toBe('#dcdcd6');
	});

	it('gives the page the app background', () => {
		expect(drawioConfig(palette).defaultPageBackgroundColor).toBe('#f8f8f6');
	});

	it('gives dark mode the app background rather than draw.io’s grey', () => {
		expect(drawioConfig(palette).darkColor).toBe('#f8f8f6');
	});
});
