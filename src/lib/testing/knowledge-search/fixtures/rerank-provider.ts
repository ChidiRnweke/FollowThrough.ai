import { createServer } from 'node:http';

/** A local protocol peer. No provider key or external network is used. */
export const rerankProvider = async (response: string, status = 200) => {
	const requests: {
		method: string | undefined;
		url: string | undefined;
		authorization: string | undefined;
		referer: string | string[] | undefined;
		title: string | string[] | undefined;
		contentType: string | undefined;
		body: string;
	}[] = [];
	const server = createServer((incoming, outgoing) => {
		const chunks: Buffer[] = [];
		incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
		incoming.on('end', () => {
			requests.push({
				method: incoming.method,
				url: incoming.url,
				authorization: incoming.headers.authorization,
				referer: incoming.headers['http-referer'],
				title: incoming.headers['x-title'],
				contentType: incoming.headers['content-type'],
				body: Buffer.concat(chunks).toString('utf8')
			});
			outgoing.writeHead(status, { 'content-type': 'application/json' });
			outgoing.end(response);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Rerank server did not bind');
	return {
		requests,
		baseURL: `http://127.0.0.1:${address.port}/v1`,
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			)
	};
};
