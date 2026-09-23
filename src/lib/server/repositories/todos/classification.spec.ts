import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { PromiseClassification } from './classification';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const provider = async (date: string | null) => {
	const promise = {
		action: 'Send the draft',
		ownerName: 'Maya',
		responsibility: 'waiting_on',
		dueDateVerbatim: 'tomorrow',
		resolvedDueDate: date,
		strength: 'explicit',
		confidence: 95
	};
	const server = createServer((incoming, outgoing) => {
		incoming.resume();
		incoming.on('end', () => {
			outgoing.writeHead(200, { 'content-type': 'application/json' });
			outgoing.end(
				JSON.stringify({
					id: 'chat_local',
					object: 'chat.completion',
					created: 1,
					model: 'test/model',
					choices: [
						{
							index: 0,
							finish_reason: 'stop',
							message: {
								role: 'assistant',
								content: JSON.stringify({ promises: [promise] }),
								refusal: null
							}
						}
					],
					usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
				})
			);
		});
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('The provider fixture did not bind');
	return {
		client: new PromiseClassification('local-key', {
			baseURL: `http://127.0.0.1:${address.port}/v1`
		}),
		close: () =>
			new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			)
	};
};

it.each(['tomorrow', '2026-02-30', '2026-02-29'])(
	'rejects invalid resolved date %s from the provider',
	async (date) => {
		const local = await provider(date);
		try {
			await expect(
				local.client.extract('Maya will send the draft tomorrow.', {
					model: 'test/model',
					requestedAt: testNow
				})
			).rejects.toThrow();
		} finally {
			await local.close();
		}
	}
);

it.each(['2026-09-23', '2028-02-29', null])(
	'keeps a valid or unresolved date %s and its original wording',
	async (date) => {
		const local = await provider(date);
		try {
			const result = await local.client.extract('Maya will send the draft tomorrow.', {
				model: 'test/model',
				requestedAt: testNow
			});
			expect(
				result?.map((promise) => ({
					date: promise.resolvedDueDate,
					wording: promise.dueDateVerbatim
				}))
			).toEqual([{ date, wording: 'tomorrow' }]);
		} finally {
			await local.close();
		}
	}
);
