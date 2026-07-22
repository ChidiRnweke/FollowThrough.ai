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
	mutedForeground: '#6b6b58',
	secondary: '#eeeee8',
	border: '#c8c8be'
};

const darkTokens: MermaidTokens = {
	background: '#0c0c09',
	foreground: '#fafaf8',
	primary: '#2d8a83',
	muted: '#2d3533',
	mutedForeground: '#9e9e8e',
	secondary: '#2a2438',
	border: '#4a4a40'
};

const createThemeVariables = (tokens: MermaidTokens, dark: boolean) => ({
	darkMode: dark,
	background: tokens.background,
	fontFamily: "'Inter Variable', sans-serif",
	fontSize: '14px',
	// Nodes — all dark fills with light text in dark mode, no warm tints
	primaryColor: tokens.muted,
	primaryTextColor: tokens.foreground,
	primaryBorderColor: tokens.border,
	secondaryColor: dark ? '#332840' : '#f3eef8',
	secondaryTextColor: tokens.foreground,
	secondaryBorderColor: dark ? '#5a4a65' : '#c8b8d8',
	tertiaryColor: dark ? '#2e3540' : '#f0f5fa',
	tertiaryTextColor: tokens.foreground,
	tertiaryBorderColor: dark ? '#4a5565' : '#c0ccd8',
	// Edges and labels
	lineColor: tokens.mutedForeground,
	textColor: tokens.foreground,
	titleColor: tokens.foreground,
	edgeLabelBackground: tokens.background,
	// Label boxes (mermaid derives pastel yellows if not pinned)
	labelBoxBkgColor: tokens.muted,
	labelBoxBorderColor: tokens.border,
	labelTextColor: tokens.foreground,
	// Subgraphs / clusters
	clusterBkg: dark ? '#181818' : '#f8f8f5',
	clusterBorder: tokens.border,
	// Notes (sequence diagrams etc.) — neutral, not warm
	noteBkgColor: dark ? '#2e3540' : '#f0f5fa',
	noteTextColor: tokens.foreground,
	noteBorderColor: dark ? '#4a5565' : '#c0ccd8',
	// Sequence actors
	actorBkg: tokens.muted,
	actorTextColor: tokens.foreground,
	actorBorder: tokens.border,
	actorLineColor: tokens.mutedForeground,
	activationBkgColor: dark ? '#253535' : '#eef8f7',
	activationBorderColor: tokens.primary,
	// Prevent mermaid from computing bright/pastel fills
	nodeBkg: tokens.muted,
	mainBkg: tokens.muted,
	nodeBorder: tokens.border,
	nodeTextColor: tokens.foreground
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
