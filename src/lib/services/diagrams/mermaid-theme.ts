import {
	lightTokens,
	darkTokens,
	type MermaidTokens,
	type MermaidTheme
} from '$lib/models/diagrams/mermaid-theme';

/** True when the source carries its own colour directives and so ignores the chosen palette. */
export const diagramKeepsOwnColours = (source: string): boolean =>
	/^\s*(?:classDef|style)\s/m.test(source);

const createThemeVariables = (tokens: MermaidTokens, dark: boolean) => ({
	darkMode: dark,
	background: tokens.background,
	fontFamily: "'Inter Variable', sans-serif",
	fontSize: '14px',
	// Nodes. `primary*` is what flowcharts actually read; mermaid re-applies these
	// overrides after its own derivation pass, so there is no need to also pin the
	// `mainBkg`/`nodeBkg`/`nodeBorder` aliases.
	primaryColor: tokens.muted,
	primaryTextColor: tokens.foreground,
	primaryBorderColor: tokens.border,
	secondaryColor: tokens.surface,
	secondaryBorderColor: tokens.border,
	tertiaryColor: tokens.surface,
	tertiaryBorderColor: tokens.border,
	// Edges and labels
	lineColor: tokens.mutedForeground,
	textColor: tokens.foreground,
	titleColor: tokens.foreground,
	edgeLabelBackground: tokens.background,
	// Subgraphs / clusters
	clusterBkg: tokens.surface,
	clusterBorder: tokens.border,
	// Sequence and state diagrams only — inert for flowcharts, but pinned because
	// mermaid otherwise derives pastel yellows and blues for these.
	labelBoxBkgColor: tokens.muted,
	labelBoxBorderColor: tokens.border,
	labelTextColor: tokens.foreground,
	noteBkgColor: tokens.surface,
	noteTextColor: tokens.foreground,
	noteBorderColor: tokens.border,
	actorBkg: tokens.muted,
	actorTextColor: tokens.foreground,
	actorBorder: tokens.border,
	actorLineColor: tokens.mutedForeground,
	activationBkgColor: tokens.surface,
	activationBorderColor: tokens.brand
});

export const mermaidTokensFor = (theme: MermaidTheme): MermaidTokens => ({
	...(theme.base === 'dark' ? darkTokens : lightTokens),
	...theme.palette
});

export const createMermaidConfig = (theme: MermaidTheme | boolean) => {
	const resolved: MermaidTheme =
		typeof theme === 'boolean' ? { base: theme ? 'dark' : 'light' } : theme;
	return {
		startOnLoad: false as const,
		theme: 'base' as const,
		themeVariables: createThemeVariables(mermaidTokensFor(resolved), resolved.base === 'dark'),
		securityLevel: 'strict' as const,
		htmlLabels: false as const,
		fontFamily: "'Inter Variable', sans-serif"
	};
};
