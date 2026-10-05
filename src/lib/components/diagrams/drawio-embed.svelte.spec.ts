import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { commands } from 'vitest/browser';
import { tick } from 'svelte';
import { mode, setMode, userPrefersMode } from 'mode-watcher';
import DrawioEmbed, { type DrawioControl, type DrawioStatus } from './drawio-embed.svelte';
import { DRAWIO_EMBED_ORIGIN } from '$lib/client/diagrams/drawio/embed-adapter';

/**
 * The embed draws no chrome of its own — every host has a header already — so a
 * test drives it the way a host does: through the control it is handed, reading
 * the status it reports.
 */
const renderEditor = (
	oncommit: (output: { xml: string; svg: string }) => Promise<void> = async () => undefined,
	onautosave?: (xml: string) => Promise<void>
) => {
	const statuses: DrawioStatus[] = [];
	let control: DrawioControl | undefined;
	const screen = render(DrawioEmbed, {
		xml: '<mxfile/>',
		title: 'Architecture',
		oncommit: oncommit as never,
		onautosave,
		oncontrol: (value: DrawioControl) => (control = value),
		onstatus: (value: DrawioStatus) => statuses.push(value)
	});
	return {
		screen,
		statuses,
		commit: () => control?.commit(),
		retry: () => control?.retry(),
		acknowledge: () => control?.acknowledge(),
		replace: (xml: string) => control?.replace(xml)
	};
};

const emit = (iframe: HTMLIFrameElement, data: Readonly<Record<string, unknown>>): void => {
	window.dispatchEvent(
		new MessageEvent('message', {
			origin: DRAWIO_EMBED_ORIGIN,
			source: iframe.contentWindow,
			data: JSON.stringify(data)
		})
	);
};

/** Lets the status effect and the commit promise settle before asserting. */
const settle = async (): Promise<void> => {
	for (let index = 0; index < 5; index += 1) {
		await tick();
	}
};

const frameOf = (screen: ReturnType<typeof renderEditor>['screen']): HTMLIFrameElement => {
	const iframe = screen.container.querySelector('iframe');
	if (!iframe) throw new Error('draw.io iframe was not rendered');
	return iframe;
};

const sendToFixture = (
	iframe: HTMLIFrameElement,
	message: Readonly<Record<string, unknown>>
): void => {
	iframe.contentWindow?.postMessage(JSON.stringify(message), DRAWIO_EMBED_ORIGIN);
};

const inspectFixture = (iframe: HTMLIFrameElement): Promise<string> =>
	new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			clearInterval(ping);
			window.removeEventListener('message', onMessage);
			reject(new Error('Draw.io protocol fixture did not return its loaded XML'));
		}, 3000);
		const onMessage = (event: MessageEvent): void => {
			if (event.source !== iframe.contentWindow || event.origin !== DRAWIO_EMBED_ORIGIN) return;
			const message = JSON.parse(String(event.data)) as { event?: string; xml?: string };
			if (message.event !== 'fixture-state') return;
			clearTimeout(timeout);
			clearInterval(ping);
			window.removeEventListener('message', onMessage);
			if (!message.xml) {
				clearTimeout(timeout);
				window.removeEventListener('message', onMessage);
				reject(new Error('Draw.io protocol fixture returned empty XML'));
				return;
			}
			resolve(message.xml);
		};
		window.addEventListener('message', onMessage);
		const ping = setInterval(() => sendToFixture(iframe, { fixtureCommand: 'inspect' }), 100);
		sendToFixture(iframe, { fixtureCommand: 'inspect' });
	});

describe('Hosted draw.io editor states', () => {
	it('clears a persistence failure after the host resolves and saves the conflict', async () => {
		const { screen, statuses, acknowledge } = renderEditor(undefined, async () => {
			throw new Error('Conflict');
		});
		emit(frameOf(screen), { event: 'autosave', xml: '<mxfile/>' });
		await settle();
		acknowledge();
		expect(statuses.at(-1)).toEqual({ phase: 'saved', modified: false });
	});
	it('retains and retries autosaved XML after persistence fails', async () => {
		let unavailable = true;
		let saved = '';
		const { screen, statuses, retry } = renderEditor(undefined, async (xml) => {
			if (unavailable) throw new Error('Offline');
			saved = xml;
		});
		emit(frameOf(screen), { event: 'autosave', xml: '<mxfile><diagram/></mxfile>' });
		await settle();
		expect(statuses.at(-1)).toMatchObject({ phase: 'failed', failure: 'Offline' });
		unavailable = false;
		retry();
		await settle();
		expect(saved).toBe('<mxfile><diagram/></mxfile>');
	});

	it('keeps edits made while saving marked as modified', async () => {
		const deferred = Promise.withResolvers<void>();
		const { screen, statuses, commit } = renderEditor(() => deferred.promise);
		const frame = frameOf(screen);
		emit(frame, { event: 'load' });
		commit();
		emit(frame, { event: 'export', xml: '<mxfile/>', data: 'data:image/svg+xml,%3Csvg/%3E' });
		await settle();
		emit(frame, { event: 'modified', modified: true });
		deferred.resolve();
		await settle();
		expect(statuses.at(-1)?.modified).toBe(true);
	});

	it('replaces the frame when accepting a different document', async () => {
		await commands.installDrawioProtocolFixture();
		try {
			const { screen, replace } = renderEditor();
			const old = frameOf(screen);
			replace('<mxfile><diagram id="replacement"/></mxfile>');
			const replacement = await vi.waitUntil(() => {
				const candidate = frameOf(screen);
				return candidate !== old ? candidate : false;
			});
			const loadedXml = await inspectFixture(replacement);
			expect({ replaced: replacement !== old, loadedXml }).toEqual({
				replaced: true,
				loadedXml: '<mxfile><diagram id="replacement"/></mxfile>'
			});
		} finally {
			await commands.removeDrawioProtocolFixture();
		}
	});

	it('renders the hosted editor with an accessible title', async () => {
		const { screen } = renderEditor();
		await expect.element(screen.getByTitle('draw.io editor for Architecture')).toBeInTheDocument();
	});

	it('reports reaching the ready phase', async () => {
		const { screen, statuses } = renderEditor();
		emit(frameOf(screen), { event: 'load' });
		await settle();
		expect(statuses.at(-1)?.phase).toBe('ready');
	});

	// draw.io only accepts `configure` while booting, so re-theming means
	// re-mounting — and a remount that did not carry the live document forward
	// would throw away whatever had been typed since the last save.
	it('carries the live document through a theme change', async () => {
		await commands.installDrawioProtocolFixture();
		const initialMode = mode.current;
		const initialPreference = userPrefersMode.current;
		try {
			const { screen, statuses } = renderEditor();
			const iframe = frameOf(screen);
			if (!iframe) throw new Error('Draw.io iframe was not rendered');
			const editedXml =
				'<mxfile><diagram id="live-edit"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0" value="Unsaved work"/></root></mxGraphModel></diagram></mxfile>';
			await inspectFixture(iframe);
			sendToFixture(iframe, { fixtureCommand: 'edit', xml: editedXml });
			const fixtureXml = await vi.waitUntil(async () => {
				const actual = await inspectFixture(iframe);
				return actual === editedXml ? actual : false;
			});
			sendToFixture(iframe, {
				fixtureCommand: 'emit',
				data: { event: 'modified', modified: true }
			});
			const modified = await vi.waitUntil(() => statuses.at(-1)?.modified);
			setMode(initialMode === 'dark' ? 'light' : 'dark');
			const replacement = await vi.waitUntil(() => {
				const candidate = frameOf(screen);
				return candidate !== iframe ? candidate : false;
			});
			const reloadedXml = await inspectFixture(replacement);
			expect({ fixtureXml, modified, replaced: replacement !== iframe, reloadedXml }).toEqual({
				fixtureXml: editedXml,
				modified: true,
				replaced: true,
				reloadedXml: editedXml
			});
		} finally {
			setMode(initialPreference);
			await commands.removeDrawioProtocolFixture();
		}
	});

	it('reports a failed save to the host', async () => {
		const { screen, statuses, commit } = renderEditor(async () => {
			throw new Error('Save failed');
		});
		const iframe = frameOf(screen);
		emit(iframe, { event: 'load' });
		commit();
		emit(iframe, {
			event: 'export',
			xml: '<mxfile/>',
			data: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'
		});
		await settle();
		expect(statuses.at(-1)).toMatchObject({ phase: 'failed', failure: 'Save failed' });
		await expect.element(screen.getByTitle('draw.io editor for Architecture')).toBeInTheDocument();
	});
});
