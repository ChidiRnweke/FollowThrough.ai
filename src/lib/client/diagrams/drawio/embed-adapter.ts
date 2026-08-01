import { z } from 'zod';

export const DRAWIO_EMBED_ORIGIN = 'https://embed.diagrams.net';
export const DRAWIO_EMBED_URL = `${DRAWIO_EMBED_ORIGIN}/?embed=1&proto=json&configure=1&spin=1&libraries=1&saveAndExit=0`;

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
	private title = '';
	private dark = false;
	private pending?: { reason: DrawioExportReason; xml?: string; exit: boolean };

	constructor(
		private readonly port: DrawioEmbedPort,
		private readonly callbacks: DrawioEmbedCallbacks = {}
	) {}

	start(input: { xml: string; title: string; dark?: boolean }): void {
		this.stop();
		this.xml = input.xml;
		this.title = input.title;
		this.dark = input.dark ?? false;
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
		} catch {
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
				this.send({
					action: 'configure',
					config: {
						passiveScroll: true,
						preserveViewState: true,
						suppressNewWindows: true
					}
				});
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
			case 'export': {
				const exported = ExportEvent.safeParse(value);
				if (!exported.success || !this.pending) return;
				try {
					const xml = exported.data.xml ?? this.pending.xml;
					if (!xml) throw new Error('draw.io did not return the current XML.');
					this.xml = xml;
					this.callbacks.onExport?.({
						xml,
						svg: decodeSvgDataUri(exported.data.data),
						reason: this.pending.reason,
						exit: this.pending.exit
					});
					this.pending = undefined;
				} catch (error) {
					this.callbacks.onFailure?.(
						error instanceof Error ? error.message : 'draw.io export failed.'
					);
				}
				break;
			}
			case 'exit': {
				const exit = ExitEvent.safeParse(value);
				if (exit.success) this.callbacks.onExit?.(exit.data.modified ?? false);
				break;
			}
		}
	}

	private load(): void {
		this.send({
			action: 'load',
			xml: this.xml,
			autosave: 0,
			modified: 'modified',
			saveAndExit: 0,
			title: this.title,
			dark: this.dark
		});
	}

	private send(message: Readonly<Record<string, unknown>>): void {
		if (!this.port.frameWindow()) return;
		this.port.post(JSON.stringify(message), DRAWIO_EMBED_ORIGIN);
	}
}
