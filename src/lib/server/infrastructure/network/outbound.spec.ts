import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { context, propagation, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ExternalServiceError } from '$lib/errors';
import { OutboundGuard, publicAddressFetch, type FetchLike } from './outbound';

interface SentRequest {
	readonly url: string;
	readonly method: string;
	readonly propagated: Record<string, string>;
}

/** Answers each request from a script and records what instrumentation would have propagated. */
const scriptedTransport = (
	answer: (url: URL) => Response
): { readonly transport: FetchLike; readonly sent: SentRequest[] } => {
	const sent: SentRequest[] = [];
	const transport: FetchLike = async (url, init) => {
		const propagated: Record<string, string> = {};
		propagation.inject(context.active(), propagated);
		sent.push({ url: String(url), method: init?.method ?? 'GET', propagated });
		return answer(new URL(url));
	};
	return { transport, sent };
};

const redirect = (location: string, status = 302) =>
	new Response(null, { status, headers: { location } });

describe('OutboundGuard', () => {
	it('refuses a plain HTTP URL before any request leaves', async () => {
		const { transport, sent } = scriptedTransport(() => new Response('{}'));
		const guard = new OutboundGuard(transport);
		await expect(guard.fetch('http://mcp.example.com/mcp')).rejects.toBeInstanceOf(
			ExternalServiceError
		);
		expect(sent).toEqual([]);
	});

	it('follows a same-origin redirect for a GET', async () => {
		const { transport, sent } = scriptedTransport((url) =>
			url.pathname === '/old' ? redirect('/new') : new Response('found')
		);
		const response = await new OutboundGuard(transport).fetch('https://mcp.example.com/old');
		expect({ body: await response.text(), urls: sent.map((request) => request.url) }).toEqual({
			body: 'found',
			urls: ['https://mcp.example.com/old', 'https://mcp.example.com/new']
		});
	});

	it('refuses a redirect to another host, and any redirect of a POST', async () => {
		const elsewhere = scriptedTransport(() => redirect('https://attacker.example.net/token'));
		const post = scriptedTransport(() => redirect('/mcp/', 307));
		await expect(
			new OutboundGuard(elsewhere.transport).fetch('https://mcp.example.com/.well-known/x')
		).rejects.toThrow('redirected to another host');
		await expect(
			new OutboundGuard(post.transport).fetch('https://mcp.example.com/mcp', { method: 'POST' })
		).rejects.toThrow('redirected a POST request');
	});

	describe('with tracing on', () => {
		let sdk: NodeSDK;
		beforeAll(() => {
			sdk = new NodeSDK({
				autoDetectResources: false,
				spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
				logRecordProcessors: [],
				instrumentations: []
			});
			sdk.start();
		});
		afterAll(async () => {
			await sdk.shutdown();
			trace.disable();
			context.disable();
			propagation.disable();
		});

		it('sends no trace context to the third party', async () => {
			const { transport, sent } = scriptedTransport(() => new Response('ok'));
			await trace.getTracer('test').startActiveSpan('agent-run', async (span) => {
				await transport('https://first-party.example.com/');
				await new OutboundGuard(transport).fetch('https://mcp.example.com/mcp');
				span.end();
			});
			expect({
				unguarded: 'traceparent' in sent[0]!.propagated,
				guarded: sent[1]!.propagated
			}).toEqual({ unguarded: true, guarded: {} });
		});
	});
});

describe('publicAddressFetch', () => {
	it('refuses hosts that resolve to private, loopback, link-local or mapped addresses', async () => {
		for (const address of [
			'10.0.0.8',
			'127.0.0.1',
			'169.254.169.254',
			'::1',
			'::ffff:127.0.0.1',
			'fd00::5'
		]) {
			const connect = publicAddressFetch(async () => [
				{ address, family: address.includes(':') ? 6 : 4 }
			]);
			await expect(connect('https://internal.example.com/')).rejects.toBeInstanceOf(
				ExternalServiceError
			);
		}
	});

	it('refuses a host when any one of its addresses is private', async () => {
		const connect = publicAddressFetch(async () => [
			{ address: '93.184.215.14', family: 4 },
			{ address: '192.168.1.20', family: 4 }
		]);
		await expect(connect('https://mixed.example.com/')).rejects.toThrow(
			'resolves to an address FollowThrough does not connect to'
		);
	});
});
