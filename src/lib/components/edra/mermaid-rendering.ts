import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

/**
 * Hex equivalents of the design tokens in `src/routes/layout.css` (`:root` /
 * `.dark`). Mermaid's color library (khroma) cannot parse `oklch()` and does
 * derive/darken math on these values, so `var(...)` references are not an
 * option — keep these in sync with layout.css when tokens change.
 */
interface MermaidTokens {
	readonly background: string;
	readonly foreground: string;
	readonly primary: string;
	readonly muted: string;
	readonly mutedForeground: string;
	readonly secondary: string;
	readonly border: string;
}

const lightTokens: MermaidTokens = {
	background: '#ffffff',
	foreground: '#0c0c09',
	primary: '#00786f',
	muted: '#f4f4f0',
	mutedForeground: '#7c7c67',
	secondary: '#f0f0ec',
	border: '#ddddd7'
};

const darkTokens: MermaidTokens = {
	background: '#0c0c09',
	foreground: '#fbfbf9',
	primary: '#005f5a',
	muted: '#2b2b22',
	mutedForeground: '#abab9c',
	secondary: '#27272a',
	border: '#2e2e2b'
};

const createThemeVariables = (tokens: MermaidTokens, dark: boolean) => ({
	darkMode: dark,
	background: tokens.background,
	fontFamily: "'Inter Variable', sans-serif",
	fontSize: '14px',
	// Nodes
	primaryColor: tokens.muted,
	primaryTextColor: tokens.foreground,
	primaryBorderColor: tokens.border,
	secondaryColor: tokens.secondary,
	secondaryTextColor: tokens.foreground,
	secondaryBorderColor: tokens.border,
	tertiaryColor: tokens.secondary,
	tertiaryTextColor: tokens.foreground,
	tertiaryBorderColor: tokens.border,
	// Edges and labels
	lineColor: tokens.mutedForeground,
	textColor: tokens.foreground,
	titleColor: tokens.foreground,
	edgeLabelBackground: tokens.background,
	// Subgraphs / clusters
	clusterBkg: tokens.secondary,
	clusterBorder: tokens.border,
	// Notes (sequence diagrams etc.)
	noteBkgColor: tokens.muted,
	noteTextColor: tokens.foreground,
	noteBorderColor: tokens.border,
	// Sequence actors
	actorBkg: tokens.muted,
	actorTextColor: tokens.foreground,
	actorBorder: tokens.border,
	actorLineColor: tokens.mutedForeground,
	activationBkgColor: tokens.secondary,
	activationBorderColor: tokens.primary
});

export const createMermaidConfig = (dark: boolean) => ({
	startOnLoad: false,
	theme: 'base' as const,
	themeVariables: createThemeVariables(dark ? darkTokens : lightTokens, dark),
	securityLevel: 'strict' as const,
	htmlLabels: false,
	fontFamily: "'Inter Variable', sans-serif"
});

/** (Re)configure mermaid for the given mode. Cheap — safe to call per render. */
export const initializeMermaid = (dark: boolean): void => {
	mermaid.initialize(createMermaidConfig(dark));
};

export const sanitizeMermaidSvg = (svg: string): string =>
	DOMPurify.sanitize(svg, {
		USE_PROFILES: { svg: true, svgFilters: true }
	});
