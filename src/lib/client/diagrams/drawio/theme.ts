/**
 * Dress the draw.io editor in the app's own surfaces.
 *
 * draw.io draws its entire chrome from a `:root` custom-property set composed
 * through `light-dark()` — `.geDiagramContainer` resolves its background from
 * `var(--workspace-color)`, panels from `var(--ge-panel-color)`, and so on. Its
 * documented `css` configuration key lets a host redefine those variables, so
 * the whole restyle is one variable block rather than a pile of `!important`
 * overrides aimed at class names that are theirs to rename.
 *
 * Everything here is pure so the mapping can be tested without a browser; the
 * component supplies the resolver that turns our OKLCH tokens into the hex
 * values mxGraph and the editor both accept.
 */

/** The app colours draw.io needs, already resolved to hex. */
export interface DrawioPalette {
	readonly background: string;
	readonly foreground: string;
	readonly card: string;
	readonly border: string;
	readonly muted: string;
	readonly mutedForeground: string;
	readonly accent: string;
	readonly accentForeground: string;
	readonly primary: string;
	readonly primaryForeground: string;
	readonly fontFamily: string;
}

/** The app tokens read for the palette, in the order `readPalette` expects them. */
export const PALETTE_TOKENS = [
	'--background',
	'--foreground',
	'--card',
	'--border',
	'--muted',
	'--muted-foreground',
	'--accent',
	'--accent-foreground',
	'--primary',
	'--primary-foreground'
] as const;

/**
 * Build the palette from a resolver.
 *
 * The resolver is injected rather than reaching for `getComputedStyle` here: the
 * iframe is cross-origin and cannot read our stylesheet, so the values have to be
 * resolved on our side anyway, and a function is what makes that testable.
 */
export const readPalette = (
	resolveColor: (token: string) => string,
	fontFamily: string
): DrawioPalette => ({
	background: resolveColor('--background'),
	foreground: resolveColor('--foreground'),
	card: resolveColor('--card'),
	border: resolveColor('--border'),
	muted: resolveColor('--muted'),
	mutedForeground: resolveColor('--muted-foreground'),
	accent: resolveColor('--accent'),
	accentForeground: resolveColor('--accent-foreground'),
	primary: resolveColor('--primary'),
	primaryForeground: resolveColor('--primary-foreground'),
	fontFamily
});

/**
 * Both slots of every light/dark pair get the same value.
 *
 * `light-dark()` picks by `color-scheme`, and we only ever resolve the theme the
 * app is actually in — so writing both slots alike means whichever one draw.io
 * reaches for is the right colour, and we never have to hold two palettes at
 * once or guess which branch its stylesheet took.
 */
const PAIRS: readonly (readonly [light: string, dark: string, key: keyof DrawioPalette])[] = [
	['--ge-panel-color', '--ge-dark-panel-color', 'card'],
	['--toolbar-color', '--dark-toolbar-color', 'card'],
	['--dialog-color', '--dark-dialog-color', 'card'],
	['--card-color', '--dark-card-color', 'card'],
	['--field-color', '--dark-field-color', 'background'],
	['--border-color', '--dark-border-color', 'border'],
	['--text-color', '--dark-text-color', 'foreground'],
	['--soft-color', '--dark-soft-color', 'muted'],
	['--scrollbar-color', '--dark-scrollbar-color', 'muted'],
	['--focus-color', '--dark-focus-color', 'primary'],
	['--accent-color', '--dark-accent-color', 'accent'],
	['--accent-text-color', '--dark-accent-text-color', 'primary']
];

/** Variables draw.io declares once, with no dark twin. */
const SINGLES: readonly (readonly [name: string, key: keyof DrawioPalette])[] = [
	['--workspace-color', 'background'],
	['--highlight-color', 'accent'],
	['--active-color', 'muted'],
	['--selected-color', 'accent'],
	['--soft-hover-color', 'muted'],
	['--accent-hover-color', 'accent'],
	['--primary-color', 'primary'],
	['--primary-hover-color', 'primary'],
	// draw.io's dark hover for the same primary button. Without it the dark theme
	// falls back to its stock blue on the one control we most want to own.
	['--dark-active-accent-color', 'primary']
];

export const drawioThemeCss = (palette: DrawioPalette): string => {
	const variables = [
		...PAIRS.flatMap(([light, dark, key]) => [
			`\t${light}: ${palette[key]};`,
			`\t${dark}: ${palette[key]};`
		]),
		...SINGLES.map(([name, key]) => `\t${name}: ${palette[key]};`)
	].join('\n');
	return `:root {
${variables}
}

/* The canvas is the one surface that must not share the panel colour: in dark
   mode draw.io resolves both from the same dark slot, so it is set outright. */
.geDiagramContainer {
	background-color: ${palette.background};
}

.geEditor,
.geEditor input,
.geEditor button,
.geEditor select,
.geEditor textarea {
	font-family: ${palette.fontFamily};
}

/* draw.io's primary button sets a background and no colour at all, so its label
   inherits the editor's text colour — which we just made near-black. Recolouring
   the background alone is what put dark text on teal. Both halves are stated
   here, and at the specificity draw.io writes its own hover rule at, because a
   shorter selector loses to it the moment the pointer arrives. */
html body.geEditor .gePrimaryBtn,
html body.geEditor .gePrimaryBtn:hover:not([disabled]) {
	background-color: ${palette.primary};
	color: ${palette.primaryForeground};
}

/* The editor's regions declare a border style and width but never a colour, so
   its structure arrives uncoloured. These are the app's hairlines, drawn inside
   the frame that already carries the inset ring. */
.geSidebarContainer:not(.geFormatContainer, .mxWindowPane *),
.geFormatContainer:not(.mxWindowPane *),
.geEditor > div > .geMenubarContainer,
.geEditor.geClassic > .geToolbarContainer {
	border-color: ${palette.border};
}

/* draw.io's own Save. The pane header owns committing, and its label says what
   committing means here — "Replace diagram" is not something a generic Save can
   express. Only the button goes: its save events still arrive and are handled. */
.gePrimaryBtn.geEmbedBtn {
	display: none;
}
`;
};

/**
 * Shapes the user draws should look like the ones the agent drew.
 *
 * mxGraph stores these as its own style strings rather than CSS, which is why
 * they are hex: an OKLCH value survives CSS but not draw.io's own colour
 * handling.
 */
const vertexStyle = (palette: DrawioPalette): Record<string, string> => ({
	rounded: '1',
	whiteSpace: 'wrap',
	html: '1',
	fillColor: palette.card,
	strokeColor: palette.border,
	fontColor: palette.foreground,
	fontFamily: palette.fontFamily
});

const edgeStyle = (palette: DrawioPalette): Record<string, string> => ({
	edgeStyle: 'orthogonalEdgeStyle',
	rounded: '1',
	html: '1',
	strokeColor: palette.mutedForeground,
	fontColor: palette.mutedForeground,
	fontFamily: palette.fontFamily
});

/**
 * Every configuration key this host sends draw.io in its `configure` message.
 * draw.io merges whatever subset it receives, so the send side accepts any
 * `Partial` of this; the app's own `drawioConfig` produces the whole record.
 */
export interface DrawioHostConfig {
	readonly passiveScroll: boolean;
	readonly preserveViewState: boolean;
	readonly suppressNewWindows: boolean;
	readonly css: string;
	readonly darkColor: string;
	readonly defaultGridColor: string;
	readonly defaultDarkGridColor: string;
	readonly defaultPageBackgroundColor: string;
	readonly defaultDarkPageBackgroundColor: string;
	readonly defaultFonts: readonly string[];
	readonly defaultVertexStyle: Readonly<Record<string, string>>;
	readonly defaultEdgeStyle: Readonly<Record<string, string>>;
	readonly presetColors: readonly string[];
	readonly hideMenus: readonly string[];
	readonly defaultLibraries: string;
	readonly sidebarWidth: number;
	readonly expandLibraries: boolean;
}

/**
 * The configuration draw.io is sent once, before it initialises.
 *
 * `passiveScroll`, `preserveViewState` and `suppressNewWindows` are behavioural
 * and predate the theming; the rest is appearance.
 */
export const drawioConfig = (palette: DrawioPalette): DrawioHostConfig => ({
	passiveScroll: true,
	preserveViewState: true,
	suppressNewWindows: true,
	css: drawioThemeCss(palette),
	darkColor: palette.background,
	// The grid and the page are drawn on a canvas, not styled by CSS, so they need
	// their own keys or they keep draw.io's light grey mesh on our dark surface.
	// Both slots carry the resolved value for the same reason the CSS pairs do.
	defaultGridColor: palette.border,
	defaultDarkGridColor: palette.border,
	defaultPageBackgroundColor: palette.background,
	defaultDarkPageBackgroundColor: palette.background,
	defaultFonts: [palette.fontFamily, 'Helvetica', 'Verdana', 'Times New Roman', 'Courier New'],
	defaultVertexStyle: vertexStyle(palette),
	defaultEdgeStyle: edgeStyle(palette),
	presetColors: [
		palette.primary,
		palette.accent,
		palette.muted,
		palette.card,
		palette.border,
		palette.foreground
	],
	// The menus that mean something in a hosted canvas. File is the host's job,
	// and Help points out of the app.
	hideMenus: ['File', 'Help'],
	// The cloud packs are the icon library. Narrowing this to the basic shapes
	// took Azure, AWS and GCP out of the palette, which is exactly what someone
	// asking for "Azure logos" needs to be able to drag in.
	defaultLibraries: 'general;uml;er;flowchart;azure;aws4;gcp2;kubernetes;network;office',
	sidebarWidth: 200,
	expandLibraries: false
});
