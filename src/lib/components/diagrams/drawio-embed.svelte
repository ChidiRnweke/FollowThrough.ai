<script lang="ts">
	import { userFacingMessage } from '$lib/errors';
	import { untrack } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { mode as colorMode } from 'mode-watcher';
	import { FtLoader as LoaderCircle } from '$lib/components/icons';
	import {
		BrowserDrawioEmbedPort,
		DRAWIO_EMBED_URL,
		DrawioEmbedAdapter,
		type DrawioExport,
		type DrawioExportReason
	} from '$lib/client/diagrams/drawio/embed-adapter';
	import { drawioConfig, readPalette } from '$lib/client/diagrams/drawio/theme';

	/** Where the editor is in the load → edit → commit cycle. */
	export type DrawioPhase = 'loading' | 'ready' | 'exporting' | 'saving' | 'saved' | 'failed';

	/** What a host needs to drive the editor from its own header. */
	export interface DrawioControl {
		commit(): void;
		review(): void;
		retry(): void;
	}

	export interface DrawioStatus {
		readonly phase: DrawioPhase;
		readonly modified: boolean;
		readonly failure?: string;
	}

	let {
		xml,
		title,
		commitReason = 'save',
		oncommit,
		onclose,
		onmodifiedchange,
		onautosave,
		onreview,
		oncapturepreview,
		oncontrol,
		onstatus
	}: {
		xml: string;
		title: string;
		commitReason?: DrawioExportReason;
		oncommit: (output: DrawioExport) => Promise<void>;
		onclose?: () => void;
		onmodifiedchange?: (modified: boolean) => void;
		onautosave?: (xml: string) => Promise<void>;
		onreview?: (output: DrawioExport) => void;
		/**
		 * Take one export as soon as the editor is ready, without the user asking.
		 *
		 * Only for a diagram that has no stored preview: nothing outside this embed
		 * can draw draw.io, so a row saved without an export can never show itself
		 * anywhere until an editor has had it open once. Silent by design — it
		 * changes nothing the user did, and it must not read as a save.
		 */
		oncapturepreview?: (output: DrawioExport) => Promise<void>;
		/**
		 * Handed the editor's controls once it exists.
		 *
		 * The embed draws no chrome of its own: every host already has a header, and
		 * a second one inside the pane printed the title twice and stacked two
		 * competing action clusters. The host renders the header; this is how its
		 * buttons reach the editor.
		 */
		oncontrol?: (control: DrawioControl) => void;
		onstatus?: (status: DrawioStatus) => void;
	} = $props();

	let iframe = $state<HTMLIFrameElement | null>(null);
	let adapter: DrawioEmbedAdapter | undefined;
	let phase = $state<DrawioPhase>('loading');
	let failure = $state('');
	let modified = $state(false);
	/** Guards the one silent export `oncapturepreview` takes, so it happens once. */
	let captured = false;
	let capturing = false;
	let reviewing = false;
	/** The theme the live editor was built for; `undefined` until it is built. */
	let appliedDark: boolean | undefined;
	let retheming = false;
	/** Bumped to remount the iframe, which is the only way to re-configure draw.io. */
	let themeToken = $state(0);
	/** The document the next mount should load: the last export, or the prop. */
	let loaded: string | undefined;

	/**
	 * Reported explicitly rather than from an `$effect`.
	 *
	 * A host passes an inline arrow, so `onstatus` has a new identity on every one
	 * of its renders — and since calling it is what makes the host render, an
	 * effect that depended on it would call itself forever.
	 */
	function report(): void {
		onstatus?.({ phase, modified, ...(failure ? { failure } : {}) });
	}

	/**
	 * Resolve our tokens to plain hex the editor can actually use.
	 *
	 * Two problems at once. The iframe is cross-origin, so it cannot read our
	 * stylesheet — and our tokens are OKLCH, which mxGraph does not understand:
	 * the grid, the page and the shape styles are painted on a canvas rather than
	 * styled by CSS, and an `oklch()` string there is silently dropped for a
	 * default. Assigning to `fillStyle` is not a conversion either — Chromium
	 * hands `oklch()` straight back — so the colour is painted and the pixel read.
	 *
	 * Painting over the app background first matters for the one translucent
	 * token: dark mode's `--border` is `oklch(1 0 0 / 0.14)`, and compositing is
	 * what turns it into the solid hairline it actually reads as.
	 */
	function makeResolver(): (token: string) => string {
		const styles = getComputedStyle(document.documentElement);
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		const base = styles.getPropertyValue('--background').trim();
		return (token) => {
			const value = styles.getPropertyValue(token).trim();
			if (!context) return value;
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = base;
			context.fillRect(0, 0, 1, 1);
			context.fillStyle = value;
			context.fillRect(0, 0, 1, 1);
			const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
			return `#${[red, green, blue].map((channel) => (channel ?? 0).toString(16).padStart(2, '0')).join('')}`;
		};
	}

	/**
	 * Re-theming means re-mounting: draw.io only accepts `configure` while it is
	 * booting, so a palette change cannot be pushed into a live editor. The current
	 * XML is exported first and loaded back into the new one — a plain remount
	 * would throw away unsaved edits, which is worse than a stale theme.
	 */
	function attach(source: string): void {
		const palette = readPalette(makeResolver(), getComputedStyle(document.body).fontFamily);
		adapter?.stop();
		adapter = new DrawioEmbedAdapter(new BrowserDrawioEmbedPort(window, () => iframe), {
			onLoading: () => {
				phase = 'loading';
				failure = '';
				report();
			},
			onLoaded: () => {
				phase = 'ready';
				report();
				if (!oncapturepreview || captured) return;
				captured = true;
				capturing = true;
				adapter?.requestExport('review');
			},
			onModified: (value) => {
				modified = value;
				onmodifiedchange?.(value);
				if (phase === 'saved') phase = 'ready';
				report();
			},
			onAutosave: (value) => void onautosave?.(value),
			onExport: (output) => {
				if (retheming) {
					retheming = false;
					// The export is the point of the round trip: it is the live document,
					// including anything typed since the last save.
					loaded = output.xml;
					themeToken += 1;
					return;
				}
				if (capturing) {
					capturing = false;
					void oncapturepreview?.(output);
					return;
				}
				if (reviewing) {
					reviewing = false;
					onreview?.(output);
					return;
				}
				void persist(output);
			},
			onExit: (isModified) => {
				modified = isModified;
				onmodifiedchange?.(isModified);
				requestClose();
			},
			onFailure: (message) => {
				failure = message;
				phase = 'failed';
				report();
			}
		});
		appliedDark = colorMode.current === 'dark';
		adapter.start({ xml: source, dark: appliedDark, config: drawioConfig(palette) });
		oncontrol?.({ commit, review, retry });
		report();
	}

	$effect(() => {
		const dark = colorMode.current === 'dark';
		if (appliedDark === undefined || dark === appliedDark || retheming) return;
		appliedDark = dark;
		// Nothing to preserve before the editor is up; otherwise round-trip the
		// document through an export so the remount reloads what is on screen.
		if (phase === 'loading') themeToken += 1;
		else {
			retheming = true;
			adapter?.requestExport('review');
		}
	});

	async function persist(output: DrawioExport): Promise<void> {
		phase = 'saving';
		failure = '';
		report();
		try {
			await oncommit(output);
			modified = false;
			onmodifiedchange?.(false);
			phase = 'saved';
			if (output.exit) onclose?.();
			// audit-allow: silent-catch — the embedded editor enters a visible failed phase and retains the diagram for retry.
		} catch (error) {
			failure = userFacingMessage(error, 'The diagram could not be saved.');
			phase = 'failed';
		}
		report();
	}

	function commit(): void {
		if (!adapter || phase === 'exporting' || phase === 'saving') return;
		phase = 'exporting';
		failure = '';
		report();
		adapter.requestExport(commitReason);
	}

	function review(): void {
		if (!adapter || phase === 'exporting' || phase === 'saving') return;
		reviewing = true;
		adapter.requestExport('review');
	}

	function retry(): void {
		failure = '';
		phase = 'loading';
		report();
		adapter?.retry();
	}

	function requestClose(): void {
		if (modified && !window.confirm('Leave without saving your diagram changes?')) return;
		onclose?.();
	}

	function onbeforeunload(event: BeforeUnloadEvent): void {
		if (modified) event.preventDefault();
	}

	beforeNavigate((navigation) => {
		if (modified && !window.confirm('Leave without saving your diagram changes?')) {
			navigation.cancel();
		}
	});
</script>

<svelte:window {onbeforeunload} />

<div class="relative min-h-96 flex-1 overflow-hidden rounded-md ring-1 ring-border ring-inset">
	{#if phase === 'loading'}
		<div class="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
			<LoaderCircle
				class="size-5 animate-spin text-muted-foreground"
				aria-label="Loading draw.io"
			/>
		</div>
	{/if}
	{#key themeToken}
		<iframe
			src={DRAWIO_EMBED_URL}
			class="size-full min-h-96 border-0"
			title={`draw.io editor for ${title}`}
			sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals"
			allow="clipboard-read; clipboard-write"
			referrerpolicy="no-referrer"
			{@attach (node: HTMLIFrameElement) => {
				// The element comes from the attachment rather than `bind:this`: the
				// binding is not assigned yet when this runs, and an adapter whose port
				// sees a null frame rejects every message the editor sends.
				//
				// `untrack` because setting the editor up writes the very state it
				// reads — a tracked attachment re-runs on its own first render and
				// tears the adapter down again, which is how it stayed on "loading".
				iframe = node;
				untrack(() => attach(loaded ?? xml));
				return () => adapter?.stop();
			}}
		></iframe>
	{/key}
</div>
