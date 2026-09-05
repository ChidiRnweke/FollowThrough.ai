import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { tick } from 'svelte';
import { DRAWIO_EMBED_ORIGIN } from '$lib/client/diagrams/drawio/embed-adapter';
import DiagramDocumentPreview from './diagram-document-preview.svelte';

const emit = (
	iframe: HTMLIFrameElement,
	data:
		| { event: 'load' }
		| { event: 'export'; xml: string; data: string }
		| { event: 'error'; error: string }
): void => {
	window.dispatchEvent(
		new MessageEvent('message', {
			origin: DRAWIO_EMBED_ORIGIN,
			source: iframe.contentWindow,
			data: JSON.stringify(data)
		})
	);
};
const frame = (container: HTMLElement): HTMLIFrameElement => {
	const value = container.querySelector('iframe');
	if (!value) throw new Error('Preview iframe missing');
	return value;
};

describe('Exact diagram document preview', () => {
	it('shows a pending preview before an export is available', async () => {
		const screen = render(DiagramDocumentPreview, { source: '<mxfile/>', title: 'Draft' });
		await expect.element(screen.getByRole('status')).toHaveTextContent('Drawing preview');
	});

	it('renders the captured document export', async () => {
		const screen = render(DiagramDocumentPreview, { source: '<mxfile/>', title: 'Draft' });
		const iframe = frame(screen.container);
		emit(iframe, { event: 'load' });
		emit(iframe, {
			event: 'export',
			xml: '<mxfile/>',
			data: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'
		});
		await expect.element(screen.getByRole('img', { name: 'Draft' })).toBeInTheDocument();
	});

	it('reports a failed preview rather than displaying an old publication', async () => {
		const screen = render(DiagramDocumentPreview, { source: '<mxfile/>', title: 'Draft' });
		emit(frame(screen.container), { event: 'error', error: 'Unable to draw this diagram' });
		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Unable to draw this diagram');
	});

	it('discards an older export after the requested document changes', async () => {
		const screen = render(DiagramDocumentPreview, { source: '<mxfile/>', title: 'Draft' });
		const old = frame(screen.container);
		emit(old, { event: 'load' });
		await screen.rerender({ source: '<mxfile><diagram/></mxfile>', title: 'New draft' });
		emit(old, { event: 'export', xml: '<mxfile/>', data: 'data:image/svg+xml,%3Csvg%2F%3E' });
		await tick();
		await expect.element(screen.getByRole('status')).toHaveTextContent('Drawing preview');
	});
});
