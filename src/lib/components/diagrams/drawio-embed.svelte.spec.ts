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
		const { screen, retry } = renderEditor(undefined, async (xml) => {
			if (unavailable) throw new Error('Offline');
			saved = xml;
		});
		emit(frameOf(screen), { event: 'autosave', xml: '<mxfile><diagram/></mxfile>' });
		await settle();
		unavailable = false;
		retry();
		await settle();
		expect(saved).toBe('<mxfile><diagram/></mxfile>');
	});

	it('reports autosave persistence failure without an uncaught rejection', async () => {
		const { screen, statuses } = renderEditor(undefined, async () => {
			throw new Error('Offline');
		});
		emit(frameOf(screen), { event: 'autosave', xml: '<mxfile/>' });
		await settle();
		expect(statuses.at(-1)).toMatchObject({ phase: 'failed', failure: 'Offline' });
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
		const { screen, replace } = renderEditor();
		const old = frameOf(screen);
		replace('<mxfile><diagram/></mxfile>');
		await settle();
		expect(frameOf(screen)).not.toBe(old);
	});

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
		expect(statuses.at(-1)).toMatchObject({ phase: 'failed', failure: 'Save failed' });
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
