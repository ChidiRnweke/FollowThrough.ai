import DOMPurify from 'dompurify';
import mermaid from 'mermaid';

/**
 * Hex equivalents of the design tokens in `src/routes/layout.css` (`:root` /
 * `.dark`). Mermaid's color library (khroma) cannot parse `oklch()` and does
 * derive/darken math on these values, so `var(...)` references are not an
 * option — keep these in sync with layout.css when tokens change.
 *
 * These are the only colors the theme uses; nothing here invents a hue. Note
 * that theme variables are the *weakest* source of color in mermaid: a diagram
 * carrying its own `classDef`, `style`, or `linkStyle` declarations overrides
 * all of them, and no amount of theming here can defend against that.
 */
interface MermaidTokens {
	/** `--background` */
	readonly background: string;
	/** `--foreground` */
	readonly foreground: string;
	/** `--brand` — the single accent, used only to mark sequence activations. */
	readonly brand: string;
	/** `--muted` — the default node fill. */
	readonly muted: string;
	/** `--muted-foreground` — edges and connector lines. */
	readonly mutedForeground: string;
	/** `--border` (dark is `oklch(1 0 0 / 14%)` composited over `--background`). */
	readonly border: string;
	/** One step off the node fill, for clusters/notes: `--secondary` / `--accent`. */
	readonly surface: string;
}

const lightTokens: MermaidTokens = {
	background: '#fdfdfa',
	foreground: '#0c0c09',
	brand: '#00786f',
	muted: '#f4f4f0',
	mutedForeground: '#757560',
	border: '#dadad5',
	surface: '#f0f0ec'
};

const darkTokens: MermaidTokens = {
	background: '#0c0c09',
	foreground: '#fbfbf9',
	brand: '#00bba7',
	muted: '#2b2b22',
	mutedForeground: '#abab9c',
	border: '#2e2e2b',
	surface: '#3b3b32'
};

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
