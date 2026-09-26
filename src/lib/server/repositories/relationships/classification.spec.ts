import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { RelationshipLanguageModel } from './classification';

const classification = {
	kind: 'prior_decision',
	justification: 'The target records the choice.',
	confidence: 90
};

const provider = async (content: string) => {
	let request: unknown;
	const server = createServer((incoming, outgoing) => {
		const chunks: Buffer[] = [];
		incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
		incoming.on('end', () => {
			request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
			outgoing.writeHead(200, { 'content-type': 'application/json' });
			outgoing.end(
				JSON.stringify({
					id: 'chat_local',
					object: 'chat.completion',
					created: 1,
					model: 'chosen/model',
					choices: [
						{
							index: 0,
							finish_reason: 'stop',
							message: { role: 'assistant', content, refusal: null }
						}
					],
					usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
				})
			);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Provider did not bind');
	const client = new RelationshipLanguageModel('local-key', {
		baseURL: `http://127.0.0.1:${address.port}/v1`,
		appURL: 'https://followthrough.test',
		observer: { run: (_name, _context, operation) => operation() }
	});
	return {
		client,
		request: () => request,
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			)
	};
};

it('uses the supplied model and parses its structured relationship output', async () => {
	const local = await provider(JSON.stringify(classification));
	try {
		const result = await local.client.classify(
			'Use OAuth',
			'The team chose OAuth.',
			'chosen/model'
		);
		expect({ result, request: local.request() }).toMatchObject({
			result: classification,
			request: { model: 'chosen/model', response_format: { type: 'json_schema' } }
		});
	} finally {
		await local.close();
	}
});

it('rejects a provider classification outside the relationship schema', async () => {
	const local = await provider(JSON.stringify({ ...classification, kind: 'invented' }));
	try {
		await expect(
			local.client.classify('Use OAuth', 'The team chose OAuth.', 'chosen/model')
		).rejects.toThrow();
	} finally {
		await local.close();
	}
});

it('fails explicitly when a stored model request no longer has credentials', async () => {
	const client = new RelationshipLanguageModel('', {
		baseURL: 'http://127.0.0.1:9',
		appURL: 'https://followthrough.test',
		observer: { run: (_name, _context, operation) => operation() }
	});
	await expect(
		client.classify('Use OAuth', 'The team chose OAuth.', 'chosen/model')
	).rejects.toMatchObject({ code: 'EXTERNAL_SERVICE' });
});
