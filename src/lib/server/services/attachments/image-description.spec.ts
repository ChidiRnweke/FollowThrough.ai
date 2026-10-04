import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { ImageDescription } from './image-description';

describe('ImageDescription', () => {
	it('sends image context to the selected model and trims its description', async () => {
		let observed:
			| {
					method: string | undefined;
					url: string | undefined;
					authorization: string | string[] | undefined;
					payload: unknown;
			  }
			| undefined;
		const server = createServer((incoming, outgoing) => {
			const chunks: Buffer[] = [];
			incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
			incoming.on('end', () => {
				observed = {
					method: incoming.method,
					url: incoming.url,
					authorization: incoming.headers.authorization,
					payload: JSON.parse(Buffer.concat(chunks).toString('utf8'))
				};
				outgoing.writeHead(200, { 'content-type': 'application/json' });
				outgoing.end(JSON.stringify({ choices: [{ message: { content: '  blue diagram  ' } }] }));
			});
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Vision server did not bind');
		try {
			const imageDataUrl =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pfsAAAAASUVORK5CYII=';
			const description = await new ImageDescription('synthetic-api-key', {
				baseURL: `http://127.0.0.1:${address.port}/v1`
			}).describe({
				imageDataUrl,
				context: 'nearby heading and note text',
				model: 'vision-test-model'
			});
			expect({ description, request: observed }).toMatchObject({
				description: 'blue diagram',
				request: {
					method: 'POST',
					url: '/v1/chat/completions',
					authorization: 'Bearer synthetic-api-key',
					payload: {
						model: 'vision-test-model',
						messages: [
							{
								role: 'user',
								content: [
									{ type: 'text', text: expect.stringContaining('nearby heading and note text') },
									{ type: 'image_url', image_url: { url: imageDataUrl } }
								]
							}
						]
					}
				}
			});
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});

	it('rejects an unsuccessful provider response', async () => {
		const server = createServer((_incoming, outgoing) => {
			outgoing.writeHead(503);
			outgoing.end();
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (!address || typeof address === 'string') throw new Error('Vision server did not bind');
		try {
			await expect(
				new ImageDescription('synthetic-api-key', {
					baseURL: `http://127.0.0.1:${address.port}/v1`
				}).describe({ imageDataUrl: 'https://example.test/image.png', model: 'vision-test-model' })
			).rejects.toThrow('Vision description failed (503)');
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});
});
