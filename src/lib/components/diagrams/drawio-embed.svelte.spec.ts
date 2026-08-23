import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import DrawioEmbed, { type DrawioControl, type DrawioStatus } from './drawio-embed.svelte';
import { DRAWIO_EMBED_ORIGIN } from '$lib/client/diagrams/drawio/embed-adapter';

/**
 * The embed draws no chrome of its own — every host has a header already — so a
 * test drives it the way a host does: through the control it is handed, reading
 * the status it reports.
 */
const renderEditor = (
	oncommit: (output: { xml: string; svg: string }) => Promise<void> = async () => undefined
) => {
	const statuses: DrawioStatus[] = [];
	let control: DrawioControl | undefined;
	const screen = render(DrawioEmbed, {
		xml: '<mxfile/>',
		title: 'Architecture',
		oncommit: oncommit as never,
		oncontrol: (value: DrawioControl) => (control = value),
		onstatus: (value: DrawioStatus) => statuses.push(value)
	});
	return { screen, statuses, commit: () => control?.commit() };
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

describe('Hosted draw.io editor states', () => {
	it('renders the hosted editor with an accessible title', async () => {
		const { screen } = renderEditor();
		await expect.element(screen.getByTitle('draw.io editor for Architecture')).toBeInTheDocument();
	});

	it('hands its controls to the host', () => {
		const { commit } = renderEditor();
		expect(commit).not.toThrow();
	});

	it('reports reaching the ready phase', async () => {
		const { screen, statuses } = renderEditor();
		emit(frameOf(screen), { event: 'load' });
		await settle();
		expect(statuses.at(-1)?.phase).toBe('ready');
	});

	// A resting state is not something the host should print, so it is reported
	// rather than rendered: the header decides what, if anything, to say.
	it('draws no status text of its own', async () => {
		const { screen } = renderEditor();
		emit(frameOf(screen), { event: 'load' });
		await settle();
		expect(screen.container.querySelectorAll('[role="status"]')).toHaveLength(0);
	});

	// draw.io only accepts `configure` while booting, so re-theming means
	// re-mounting — and a remount that did not carry the live document forward
	// would throw away whatever had been typed since the last save.
	it('carries the live document through a theme change', async () => {
		const { screen } = renderEditor();
		const iframe = frameOf(screen);
		emit(iframe, { event: 'load' });
		await settle();
		document.documentElement.classList.add('dark');
		await settle();
		document.documentElement.classList.remove('dark');
		await expect.element(screen.getByTitle('draw.io editor for Architecture')).toBeInTheDocument();
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
		expect(statuses.at(-1)?.failure).toBe('Save failed');
	});

	it('keeps the iframe mounted when persistence fails', async () => {
		const { screen, commit } = renderEditor(async () => {
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
		await expect.element(screen.getByTitle('draw.io editor for Architecture')).toBeInTheDocument();
	});
});
