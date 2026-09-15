import { describe, expect, it } from 'vitest';
import type { AgentRunContext, PreparedAgentRun, RunAgentInput } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import {
	InMemoryModelProvider,
	InMemoryTextModel
} from '$lib/testing/agent/fakes/in-memory-model-provider';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { testActor, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';
import { ConversationBuffer } from '../conversations/buffer';
import { AgentReplayVirtualizer } from '../conversations/replay-virtualizer';
import { AgentReasoning } from './reasoning';

const context: AgentRunContext = { contextNotes: [], skills: { items: [] } };
const now = '2026-09-16T00:00:00.000Z' as DateTime;
const conversationId = testConversationId();
const imageUrl =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
const request: RunAgentInput = {
	conversationId,
	prompt: 'Describe the image',
	visionModelOverride: 'test/vision',
	images: [
		{
			id: 'image-1',
			mediaType: 'image/png',
			dataUrl: imageUrl,
			name: 'sample.png'
		}
	]
};
const run: PreparedAgentRun = {
	kind: 'agent',
	id: '10000000-0000-4000-8000-000000000001' as PreparedAgentRun['id'],
	userId: testActor().userId,
	conversationId,
	model: 'test/text',
	executionMode: 'approval_required',
	status: 'running',
	requestId: 'image-preparation-test',
	pendingDecisions: [],
	inputSnapshot: request,
	contextSnapshot: context,
	createdAt: now,
	updatedAt: now
};
const completion = (content: string | null) => ({
	id: 'caption-1',
	object: 'chat.completion',
	created: 1,
	model: 'test/vision',
	choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }]
});
const setup = (fetch: typeof globalThis.fetch, prepare = async () => {}) => {
	const model = new InMemoryTextModel('The image is described.');
	const provider = new InMemoryModelProvider(model);
	const sessions = new InMemoryAgentSessionRepository();
	const reasoning = new AgentReasoning(
		async () => {
			await prepare();
			return {
				agentTools: () => [],
				offeredToolNames: () => [],
				catalog: () => [],
				reviewDecision: (pending) => pending
			};
		},
		sessions,
		'test-key',
		'https://provider.test/v1',
		'https://app.test',
		fetch,
		(repository, actor, id) =>
			new ConversationBuffer(
				repository,
				actor,
				id,
				new AgentReplayVirtualizer(new InMemoryAgentFiles())
			),
		undefined,
		{},
		() => provider
	);
	const execute = async (signal = new AbortController().signal, input = request) => {
		const updates = [];
		for await (const update of reasoning.execute({
			actor: testActor(),
			run: { ...run, inputSnapshot: input },
			request: input,
			context,
			signal,
			toolExecutor: { execute: async (_input, action) => action() }
		}))
			updates.push(update);
		return updates;
	};
	return { model, provider, execute };
};

describe('agent image preparation', () => {
	it('aborts remaining image requests when another description fails', async () => {
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
		const { execute } = setup(transport);
		const images = [
			{ id: 'first-image', name: 'first.png', mediaType: 'image/png' as const, dataUrl: imageUrl },
			{ id: 'second-image', name: 'second.png', mediaType: 'image/png' as const, dataUrl: imageUrl }
		];
		const result = await execute(new AbortController().signal, { ...request, images }).then(
			() => ({ kind: 'success' }),
			() => ({ kind: 'failure' })
		);
		expect({ result, activeRequests: active.size }).toEqual({
			result: { kind: 'failure' },
			activeRequests: 0
		});
	});
	it.each(['', ' \n ', null])('rejects unusable image description %s', async (content) => {
		const { execute } = setup(async () => Response.json(completion(content)));
		await expect(execute()).rejects.toThrow('Image description provider returned no usable text');
	});
	it('releases the model provider when tool preparation fails', async () => {
		const { execute, provider } = setup(
			async () => Response.json(completion('A chart')),
			async () => {
				throw new Error('Tool preparation failed');
			}
		);
		const result = await execute().then(
			() => ({ kind: 'success' }),
			() => ({ kind: 'failure' })
		);
		expect({ result, released: provider.closed }).toEqual({
			result: { kind: 'failure' },
			released: true
		});
	});
	it('releases the model provider when image description is rejected', async () => {
		const { execute, provider } = setup(async () =>
			Response.json({ error: { message: 'Image rejected' } }, { status: 400 })
		);
		const result = await execute().then(
			() => ({ kind: 'success' }),
			() => ({ kind: 'failure' })
		);
		expect({ result, released: provider.closed }).toEqual({
			result: { kind: 'failure' },
			released: true
		});
	});
	it('does not prepare a run cancelled before execution', async () => {
		const abort = new AbortController();
		abort.abort(new Error('Cancelled before preparation'));
		const { execute } = setup(async () => {
			throw new Error('Unexpected provider request');
		});
		await expect(execute(abort.signal)).rejects.toThrow('Cancelled before preparation');
	});
	it('cancels an in-flight image description and releases the provider', async () => {
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
		const { execute, provider } = setup(transport);
		const result = execute(abort.signal).then(
			() => ({ kind: 'success' }),
			() => ({ kind: 'failure' })
		);
		await pending;
		abort.abort();
		expect({ result: await result, released: provider.closed }).toEqual({
			result: { kind: 'failure' },
			released: true
		});
	});
	it('provides the generated description to a text-only model', async () => {
		const { execute, model } = setup(async () =>
			Response.json(completion('  A chart of monthly sales.  '))
		);
		await execute();
		expect(JSON.stringify(model.requests[0]?.input)).toContain(
			'Image 1: A chart of monthly sales.'
		);
	});
	it('keeps the original image for a model with native vision', async () => {
		const { execute, model } = setup(async () => {
			throw new Error('Native vision must not request a caption');
		});
		const { visionModelOverride: _override, ...native } = request;
		await execute(new AbortController().signal, native);
		expect(JSON.stringify(model.requests[0]?.input)).toContain(imageUrl);
	});
});
