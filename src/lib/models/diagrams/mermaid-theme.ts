export interface MermaidTokens {
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

export const lightTokens: MermaidTokens = {
	background: '#fdfdfa',
	foreground: '#0c0c09',
	brand: '#00786f',
	muted: '#f4f4f0',
	mutedForeground: '#757560',
	border: '#dadad5',
	surface: '#f0f0ec'
};

export const darkTokens: MermaidTokens = {
	background: '#0c0c09',
	foreground: '#fbfbf9',
	brand: '#00bba7',
	muted: '#2b2b22',
	mutedForeground: '#abab9c',
	border: '#2e2e2b',
	surface: '#3b3b32'
};

/**
 * Which palette a diagram renders with.
 *
 * `'light'`/`'dark'` are the app's own token sets; `'auto'` follows the reader's colour
 * mode, which is the right default in the editor and the wrong one for an export.
 * A custom palette overrides individual tokens on top of a base.
 *
 * Note the limit, which no amount of configuration here removes: theme variables are the
 * weakest source of colour in mermaid, so a diagram carrying its own `classDef`, `style`
 * or `linkStyle` keeps its own colours regardless of what is chosen.
 */
export type MermaidPalette = Partial<MermaidTokens>;

export interface MermaidTheme {
	readonly base: 'light' | 'dark';
	readonly palette?: MermaidPalette;
	/** Omit the background fill so the diagram sits on whatever it is placed on. */
	readonly transparent?: boolean;
}

export const MERMAID_PALETTE_KEYS = [
	'background',
	'foreground',
	'brand',
	'muted',
	'mutedForeground',
	'border',
	'surface'
] as const satisfies readonly (keyof MermaidTokens)[];

/** Human labels for the palette editor, so the UI does not invent its own wording. */
export const MERMAID_PALETTE_LABELS: Readonly<Record<keyof MermaidTokens, string>> = {
	background: 'Background',
	foreground: 'Text',
	brand: 'Accent',
	muted: 'Node fill',
	mutedForeground: 'Lines',
	border: 'Borders',
	surface: 'Groups'
};

export interface MermaidRenderConfig {
	readonly startOnLoad: false;
	readonly theme: 'base';
	readonly themeVariables: Readonly<Record<string, string | boolean>>;
	readonly securityLevel: 'strict';
	readonly htmlLabels: false;
	readonly fontFamily: string;
}
