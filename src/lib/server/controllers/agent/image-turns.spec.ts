import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';
import type { ConversationId, RunAgentInput } from '$lib/models/agent';
import { AgentTurnService } from '$lib/server/services/agent/runs/turns';
import {
	InMemoryModelProvider,
	InMemoryTextModel
} from '$lib/testing/agent/fakes/in-memory-model-provider';
import { agentContextFixture } from '$lib/testing/agent/fixtures/context';
import { testActor, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';

const imageUrl =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const image = (id: string, name: string) => ({
	id,
	name,
	mediaType: 'image/png' as const,
	dataUrl: imageUrl
});
const request = (): RunAgentInput => ({
	conversationId: crypto.randomUUID() as ConversationId,
	prompt: 'Describe the image',
	visionModelOverride: 'test/vision',
	images: [image('40000000-0000-4000-8000-000000018001', 'sample.png')]
});
const completion = (content: string | null) => ({
	id: 'caption-1',
	object: 'chat.completion',
	created: 1,
	model: 'test/vision',
	choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }]
});

/**
 * A harness whose chat model is text-only unless the request drops its vision override, and
 * whose vision model answers through `transport`.
 */
const setup = (transport: typeof globalThis.fetch) => {
	const model = new InMemoryTextModel('The image is described.');
	const leases: InMemoryModelProvider[] = [];
	const fixture = agentContextFixture({
		turns: new AgentTurnService({
			models: () => {
				const lease = new InMemoryModelProvider(model);
				leases.push(lease);
				return lease;
			},
			images: new OpenAI({
				apiKey: 'test-key',
				baseURL: 'https://provider.test/v1',
				fetch: transport
			})
		})
	});
	const run = (input = request(), signal = new AbortController().signal) =>
		fixture.builder
			.build(testActor(), input, { provenanceId: testProvenanceId() }, [], signal)
			.then(
				() => 'completed',
				(error: Error) => error.message
			);
	return { model, leases, run };
};

describe('Images in an agent turn', () => {
	it('aborts the remaining descriptions when one fails, before any model lease opens', async () => {
		let release!: (response: Response) => void;
		const first = new Promise<Response>((resolve) => {
			release = resolve;
		});
		let waitingForFirst = true;
		const active = new Set<AbortSignal>();
		const transport: typeof globalThis.fetch = async (_url, options) => {
			if (waitingForFirst) {
				waitingForFirst = false;
				return first;
			}
			const signal = options?.signal;
			if (!signal) throw new Error('No cancellation signal');
			active.add(signal);
			return new Promise<Response>((_resolve, reject) => {
				signal.addEventListener(
					'abort',
					() => {
						active.delete(signal);
						reject(signal.reason);
					},
					{ once: true }
				);
				release(Response.json(completion('')));
			});
		};
		const { run, leases } = setup(transport);
		const outcome = await run({
			...request(),
			images: [
				image('40000000-0000-4000-8000-000000018001', 'first.png'),
				image('40000000-0000-4000-8000-000000018002', 'second.png')
			]
		});
		expect({
			failed: outcome !== 'completed',
			activeRequests: active.size,
			leases: leases.length
		}).toEqual({ failed: true, activeRequests: 0, leases: 0 });
	});

	it.each(['', ' \n ', null])('rejects unusable image description %s', async (content) => {
		const { run } = setup(async () => Response.json(completion(content)));
		expect(await run()).toContain('Image description provider returned no usable text');
	});

	it('fails without opening a model lease when the vision provider rejects the image', async () => {
		const { run, leases } = setup(async () =>
			Response.json({ error: { message: 'Image rejected' } }, { status: 400 })
		);
		expect({ failed: (await run()) !== 'completed', leases: leases.length }).toEqual({
			failed: true,
			leases: 0
		});
	});

	it('stops an in-flight image description when the run is cancelled', async () => {
		const abort = new AbortController();
		let started!: () => void;
		const pending = new Promise<void>((resolve) => {
			started = resolve;
		});
		const transport: typeof globalThis.fetch = async (_url, options) =>
			new Promise<Response>((_resolve, reject) => {
				const signal = options?.signal;
				if (!signal) throw new Error('No cancellation signal');
				signal.addEventListener('abort', () => reject(signal.reason), { once: true });
				started();
			});
		const { run, leases } = setup(transport);
		const outcome = run(request(), abort.signal);
		await pending;
		abort.abort();
		expect({ outcome: await outcome, leases: leases.length }).toEqual({
			outcome: 'The run was cancelled',
			leases: 0
		});
	});

	it('provides the generated description to a text-only model', async () => {
		const { run, model } = setup(async () =>
			Response.json(completion('  A chart of monthly sales.  '))
		);
		await run();
		expect(JSON.stringify(model.requests[0]?.input)).toContain(
			'Image 1: A chart of monthly sales.'
		);
	});

	it('keeps the original image for a model with native vision', async () => {
		const { run, model } = setup(async () => {
			throw new Error('Native vision must not request a caption');
		});
		const { visionModelOverride: _override, ...native } = request();
		await run(native);
		expect(JSON.stringify(model.requests[0]?.input)).toContain(imageUrl);
	});

	it('provides app-supplied images to native vision', async () => {
		const { run, model } = setup(async () => {
			throw new Error('Native vision must not request a caption');
		});
		const { visionModelOverride: _override, images, ...native } = request();
		await run({ ...native, contextImages: images });
		expect(JSON.stringify(model.requests[0]?.input)).toContain(imageUrl);
	});

	it('describes app-supplied images for a text-only model', async () => {
		const { run, model } = setup(async () => Response.json(completion('A diagram render.')));
		const { images, ...contextual } = request();
		await run({ ...contextual, contextImages: images });
		expect(JSON.stringify(model.requests[0]?.input)).toContain('Image 1: A diagram render.');
	});

	it('does not prepare a run cancelled before execution', async () => {
		const abort = new AbortController();
		abort.abort(new Error('Cancelled before preparation'));
		const { run, leases } = setup(async () => {
			throw new Error('Unexpected provider request');
		});
		expect({ outcome: await run(request(), abort.signal), leases: leases.length }).toEqual({
			outcome: 'The run was cancelled',
			leases: 0
		});
	});

	it('releases the model lease once the turn completes', async () => {
		const { run, leases } = setup(async () => Response.json(completion('A chart')));
		await run();
		expect(leases.map((lease) => lease.closed)).toEqual([true]);
	});
});
