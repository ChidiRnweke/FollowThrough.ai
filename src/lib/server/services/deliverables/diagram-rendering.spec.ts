import { describe, expect, it } from 'vitest';
import { DiagramRasterizer } from './diagram-rendering';
import { createMermaidConfig } from '$lib/services/diagrams/mermaid-theme';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

describe('server diagram rasterization', () => {
	it('does not fetch external resources embedded in a saved SVG', async () => {
		const requests: string[] = [];
		const server = createServer((request, response) => {
			requests.push(request.url ?? '');
			response.end();
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		try {
			const port = (server.address() as AddressInfo).port;
			await new DiagramRasterizer().render(
				[
					{
						kind: 'svg',
						key: 'external-image',
						source: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/><image href="http://127.0.0.1:${port}/private" width="20" height="20"/></svg>`
					}
				],
				createMermaidConfig(false)
			);
			expect(requests).toEqual([]);
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	}, 30_000);
	it('renders Mermaid source as a PNG with its diagram dimensions', async () => {
		const result = await new DiagramRasterizer().render(
			[{ kind: 'mermaid', key: 'flow', source: 'flowchart LR\n A[Source] --> B[Document]' }],
			createMermaidConfig(false)
		);
		const raster = result.get('flow');
		if (!raster) throw new Error('Diagram was not rendered');
		const bytes = Buffer.from(raster.png.split(',')[1]!, 'base64');
		expect({
			signature: bytes.subarray(1, 4).toString(),
			width: bytes.readUInt32BE(16),
			height: bytes.readUInt32BE(20)
		}).toEqual({
			signature: 'PNG',
			width: Math.ceil(raster.size.width) * 2,
			height: Math.ceil(raster.size.height) * 2
		});
	}, 30_000);
	it('renders saved SVG diagrams without requiring a browser-supplied PNG', async () => {
		const result = await new DiagramRasterizer().render(
			[
				{
					kind: 'svg',
					key: 'drawio',
					source:
						'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="80"><rect width="180" height="80" fill="red"/></svg>'
				}
			],
			createMermaidConfig(false)
		);
		expect(result.get('drawio')?.size).toEqual({ width: 180, height: 80 });
	}, 30_000);
	it('fails explicitly for invalid Mermaid source', async () => {
		await expect(
			new DiagramRasterizer().render(
				[{ kind: 'mermaid', key: 'invalid', source: 'this is not a Mermaid diagram' }],
				createMermaidConfig(false)
			)
		).rejects.toThrow('A diagram could not be rendered for export');
	}, 30_000);
});
