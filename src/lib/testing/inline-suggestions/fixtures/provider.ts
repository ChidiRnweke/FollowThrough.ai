import { createServer } from 'node:http';

/** A local protocol peer. No provider key or external network is used. */
export const inlineCompletionProvider = async (
	response: string | Promise<string>,
	status = 200
) => {
	const received = Promise.withResolvers<void>();
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
				title: incoming.headers['x-openrouter-title'],
				contentType: incoming.headers['content-type'],
				body: Buffer.concat(chunks).toString('utf8')
			});
			received.resolve();
			void Promise.resolve(response).then((body) => {
				outgoing.writeHead(status, { 'content-type': 'application/json' });
				outgoing.end(body);
			});
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Completion server did not bind');
	return {
		requests,
		received: received.promise,
		baseURL: `http://127.0.0.1:${address.port}/v1`,
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			)
	};
};
