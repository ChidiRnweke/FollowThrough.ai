import { describe, expect, it } from 'vitest';
import type { ServerIcon } from '$lib/models/connectors';
import { FakeConnectorNetwork } from '$lib/testing/connectors/fakes/fake-connector-network';
import { ConnectorIcons } from './icons';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';

const icon = (src: string, theme?: 'light' | 'dark'): ServerIcon => ({
	src,
	mimeType: undefined,
	theme
});

const serving = (files: Record<string, Uint8Array<ArrayBuffer> | string>) => {
	const network = new FakeConnectorNetwork()
		.route('https://tools.acme.example', async (request) => {
			const body = files[new URL(request.url).pathname];
			return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
		})
		.route('https://tracker.example.net', async () => new Response(PNG));
	return { network, icons: new ConnectorIcons(network.fetch) };
};

describe('ConnectorIcons', () => {
	it('takes the light icon from the server origin and identifies it by its bytes', async () => {
		const { icons } = serving({ '/dark.png': PNG, '/light.svg': SVG });
		const fetched = await icons.fetch('https://tools.acme.example/mcp', [
			icon('https://tools.acme.example/dark.png', 'dark'),
			{ ...icon('https://tools.acme.example/light.svg', 'light'), mimeType: 'image/png' }
		]);
		expect(fetched.kind === 'icon' ? fetched.icon.mediaType : fetched).toBe('image/svg+xml');
	});

	it('never asks another origin for an icon', async () => {
		const { icons, network } = serving({});
		const fetched = await icons.fetch('https://tools.acme.example/mcp', [
			icon('https://tracker.example.net/pixel.png')
		]);
		expect({
			kind: fetched.kind,
			asked: network.sent.map((request) => new URL(request.url).host)
		}).toEqual({ kind: 'none', asked: [] });
	});

	it('refuses bytes that are no image and an icon over the size limit', async () => {
		const { icons } = serving({
			'/script.png': '<script>alert(1)</script>',
			'/huge.png': new Uint8Array(300 * 1024).fill(0x89)
		});
		const fetched = await icons.fetch('https://tools.acme.example/mcp', [
			icon('https://tools.acme.example/script.png'),
			icon('https://tools.acme.example/huge.png')
		]);
		expect(fetched.kind).toBe('none');
	});

	it('reads a data URI without a request', async () => {
		const { icons, network } = serving({});
		const fetched = await icons.fetch('https://tools.acme.example/mcp', [
			icon(`data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}`)
		]);
		expect({
			type: fetched.kind === 'icon' ? fetched.icon.mediaType : fetched.kind,
			requests: network.sent.length
		}).toEqual({ type: 'image/svg+xml', requests: 0 });
	});
});
