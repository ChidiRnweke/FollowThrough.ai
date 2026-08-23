import { z } from 'zod';
import { uncompressDrawioXml } from './uncompress';

export const DRAWIO_EMBED_ORIGIN = 'https://embed.diagrams.net';
// `compressed=0` is load-bearing: without it the embed returns each `<diagram>`
// body as base64 raw-deflate, which the server's validator refuses to store —
// every save failed with "Each draw.io diagram requires one uncompressed
// mxGraphModel". `uncompressDrawioXml` covers the case where it is ignored.
export const DRAWIO_EMBED_URL = `${DRAWIO_EMBED_ORIGIN}/?embed=1&proto=json&configure=1&spin=1&libraries=1&saveAndExit=0&compressed=0`;

export interface DrawioMessageEvent {
	readonly origin: string;
	readonly source: unknown;
	readonly data: unknown;
}

export interface DrawioEmbedPort {
	frameWindow(): unknown | null;
	listen(listener: (event: DrawioMessageEvent) => void): () => void;
	post(message: string, targetOrigin: string): void;
}

export class BrowserDrawioEmbedPort implements DrawioEmbedPort {
	constructor(
		private readonly hostWindow: Window,
		private readonly iframe: () => HTMLIFrameElement | null
	) {}

	frameWindow(): Window | null {
		return this.iframe()?.contentWindow ?? null;
	}

	listen(listener: (event: DrawioMessageEvent) => void): () => void {
		const handler = (event: MessageEvent) => listener(event);
		this.hostWindow.addEventListener('message', handler);
		return () => this.hostWindow.removeEventListener('message', handler);
	}

	post(message: string, targetOrigin: string): void {
		this.iframe()?.contentWindow?.postMessage(message, targetOrigin);
	}
}

export type DrawioExportReason = 'review' | 'save';

export interface DrawioExport {
	readonly xml: string;
	readonly svg: string;
	readonly reason: DrawioExportReason;
	readonly exit: boolean;
}

export interface DrawioEmbedCallbacks {
	onLoading?: () => void;
	onLoaded?: () => void;
	onModified?: (modified: boolean) => void;
	onAutosave?: (xml: string) => void;
	onExport?: (output: DrawioExport) => void;
	onExit?: (modified: boolean) => void;
	onFailure?: (message: string) => void;
}

const EventEnvelope = z.object({ event: z.string() }).passthrough();
const ErrorEvent = z.object({ event: z.string(), error: z.string().min(1) }).passthrough();
const SaveEvent = z
	.object({
		event: z.literal('save'),
		xml: z.string().min(1).max(2_000_000),
		exit: z.boolean().optional()
	})
	.passthrough();
const AutosaveEvent = z
	.object({
		event: z.literal('autosave'),
		xml: z.string().min(1).max(2_000_000)
	})
	.passthrough();
const ExportEvent = z
	.object({
		event: z.literal('export'),
		data: z.string().min(1).max(3_000_000),
		xml: z.string().min(1).max(2_000_000).optional()
	})
	.passthrough();
const ExitEvent = z
	.object({ event: z.literal('exit'), modified: z.boolean().optional() })
	.passthrough();
const ModifiedEvent = z
	.object({ event: z.literal('modified'), modified: z.boolean() })
	.passthrough();

const decodeSvgDataUri = (uri: string): string => {
	const match = /^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,(.*)$/is.exec(uri);
	if (!match) throw new Error('draw.io returned an invalid SVG export.');
	if (!match[1]) return decodeURIComponent(match[2]!);
	const binary = atob(match[2]!);
	return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
};

export class DrawioEmbedAdapter {
	private unsubscribe?: () => void;
	private xml = '';
	private dark = false;
	private pending?: { reason: DrawioExportReason; xml?: string; exit: boolean };
	/**
	 * Behavioural defaults, kept here so an embed that asks for no theming still
	 * scrolls and navigates the way the app needs.
	 */
	private config: Readonly<Record<string, unknown>> = {
		passiveScroll: true,
		preserveViewState: true,
		suppressNewWindows: true
	};

	constructor(
		private readonly port: DrawioEmbedPort,
		private readonly callbacks: DrawioEmbedCallbacks = {}
	) {}

	start(input: {
		xml: string;
		dark?: boolean;
		/** Appearance and behaviour, sent once before the editor initialises. */
		config?: Readonly<Record<string, unknown>>;
	}): void {
		this.stop();
		this.xml = input.xml;
		this.dark = input.dark ?? false;
		if (input.config) this.config = input.config;
		this.callbacks.onLoading?.();
		this.unsubscribe = this.port.listen((event) => this.receive(event));
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = undefined;
		this.pending = undefined;
	}

	retry(): void {
		this.callbacks.onLoading?.();
		this.load();
	}

	requestExport(reason: DrawioExportReason): void {
		this.pending = { reason, exit: false };
		this.send({
			action: 'export',
			format: 'svg',
			embedImages: false,
			embedFonts: false
		});
	}

	private receive(event: DrawioMessageEvent): void {
		const activeFrame = this.port.frameWindow();
		if (
			event.origin !== DRAWIO_EMBED_ORIGIN ||
			!activeFrame ||
			event.source !== activeFrame ||
			typeof event.data !== 'string'
		)
			return;
		let value: unknown;
		try {
			value = JSON.parse(event.data);
		} catch (error) {
			this.callbacks.onFailure?.(
				error instanceof Error ? error.message : 'draw.io sent an unreadable response'
			);
			return;
		}
		const envelope = EventEnvelope.safeParse(value);
		if (!envelope.success) return;
		const failure = ErrorEvent.safeParse(value);
		if (failure.success) {
			this.callbacks.onFailure?.(failure.data.error);
			return;
		}

		switch (envelope.data.event) {
			case 'configure':
				this.send({ action: 'configure', config: this.config });
				break;
			case 'init':
				this.load();
				break;
			case 'load':
				this.callbacks.onLoaded?.();
				break;
			case 'modified': {
				const modified = ModifiedEvent.safeParse(value);
				if (modified.success) this.callbacks.onModified?.(modified.data.modified);
				break;
			}
			case 'save': {
				const save = SaveEvent.safeParse(value);
				if (!save.success) return;
				this.pending = { reason: 'save', xml: save.data.xml, exit: save.data.exit ?? false };
				this.send({
					action: 'export',
					format: 'svg',
					embedImages: false,
					embedFonts: false
				});
				break;
			}
			case 'autosave': {
				const autosave = AutosaveEvent.safeParse(value);
				if (autosave.success) void this.emitAutosave(autosave.data.xml);
				break;
			}
			case 'export': {
				const exported = ExportEvent.safeParse(value);
				if (!exported.success || !this.pending) return;
				// Inflating is async, so the export leaves the switch here and
				// completes on its own; `pending` is cleared first so a second
				// export event cannot be answered with this one's reason.
				const pending = this.pending;
				this.pending = undefined;
				void this.emitExport(exported.data, pending);
				break;
			}
			case 'exit': {
				const exit = ExitEvent.safeParse(value);
				if (exit.success) this.callbacks.onExit?.(exit.data.modified ?? false);
				break;
			}
		}
	}

	private async emitAutosave(raw: string): Promise<void> {
		try {
			const xml = await uncompressDrawioXml(raw);
			this.xml = xml;
			this.callbacks.onAutosave?.(xml);
		} catch (error) {
			this.callbacks.onFailure?.(
				error instanceof Error ? error.message : 'draw.io autosave failed.'
			);
		}
	}

	private async emitExport(
		exported: { readonly data: string; readonly xml?: string },
		pending: { reason: DrawioExportReason; xml?: string; exit: boolean }
	): Promise<void> {
		try {
			const raw = exported.xml ?? pending.xml;
			if (!raw) throw new Error('draw.io did not return the current XML.');
			const xml = await uncompressDrawioXml(raw);
			this.xml = xml;
			this.callbacks.onExport?.({
				xml,
				svg: decodeSvgDataUri(exported.data),
				reason: pending.reason,
				exit: pending.exit
			});
		} catch (error) {
			this.callbacks.onFailure?.(error instanceof Error ? error.message : 'draw.io export failed.');
		}
	}

	private load(): void {
		this.send({
			action: 'load',
			xml: this.xml,
			autosave: 1,
			modified: 'modified',
			saveAndExit: 0,
			// Exit belongs to a host that can be exited. A workbench pane has no
			// such gesture — its close is the tab's — so the button did nothing at
			// all when pressed, which is worse than not offering it.
			noExitBtn: 1,
			// No title is sent. The pane header names the diagram; sending it here
			// put the same words in the editor's menubar, on screen twice. The
			// iframe's accessible name is set by the component, from its own prop.
			dark: this.dark
		});
	}

	private send(message: Readonly<Record<string, unknown>>): void {
		if (!this.port.frameWindow()) return;
		this.port.post(JSON.stringify(message), DRAWIO_EMBED_ORIGIN);
	}
}
