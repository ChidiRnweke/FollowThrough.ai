import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DrawioEmbed from './drawio-embed.svelte';
import { DRAWIO_EMBED_ORIGIN } from '$lib/client/drawio/embed-adapter';

const renderEditor = () =>
	render(DrawioEmbed, {
		xml: '<mxfile/>',
		title: 'Architecture',
		oncommit: async () => undefined
	});

const emit = (iframe: HTMLIFrameElement, data: Readonly<Record<string, unknown>>): void => {
	window.dispatchEvent(
		new MessageEvent('message', {
			origin: DRAWIO_EMBED_ORIGIN,
			source: iframe.contentWindow,
			data: JSON.stringify(data)
		})
	);
};

describe('Hosted draw.io editor states', () => {
	it('renders the hosted editor with an accessible title', async () => {
		const screen = await renderEditor();
		await expect.element(screen.getByTitle('draw.io editor for Architecture')).toBeInTheDocument();
	});

	it('announces when the protocol fixture finishes loading', async () => {
		const screen = await renderEditor();
		const iframe = screen.container.querySelector('iframe');
		if (!iframe) throw new Error('draw.io iframe was not rendered');
		emit(iframe, { event: 'load' });
		await expect.element(screen.getByRole('status')).toHaveTextContent('Draw.io editor ready');
	});

	it('keeps the iframe mounted when persistence fails', async () => {
		const screen = await render(DrawioEmbed, {
			xml: '<mxfile/>',
			title: 'Architecture',
			oncommit: async () => {
				throw new Error('Save failed');
			}
		});
		const iframe = screen.container.querySelector('iframe');
		if (!iframe) throw new Error('draw.io iframe was not rendered');
		emit(iframe, { event: 'load' });
		await screen.getByRole('button', { name: 'Save' }).click();
		emit(iframe, {
			event: 'export',
			xml: '<mxfile/>',
			data: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'
		});
		await expect.element(screen.getByTitle('draw.io editor for Architecture')).toBeInTheDocument();
	});
});
