import { afterEach, expect, it, vi } from 'vitest';
import type { ConversationImageInput } from '$lib/models/agent';
import { isTerminalAgentRunStatus } from '$lib/services/agent/run-status';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const image: ConversationImageInput = {
	id: '40000000-0000-4000-8000-000000018001',
	name: 'pixel.png',
	mediaType: 'image/png',
	dataUrl:
		'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='
};
const active: ReturnType<typeof agentSubmissionFixture>[] = [];
const setup = (configuration: Parameters<typeof agentSubmissionFixture>[1] = {}) => {
	const fixture = agentSubmissionFixture('queued', configuration);
	active.push(fixture);
	return fixture;
};
afterEach(async () => {
	for (const fixture of active.splice(0)) {
		for (const run of fixture.runs.runs) await fixture.controller.cancel(testActor(), run.id);
		fixture.release();
		await vi.waitFor(() => {
			if (fixture.runs.runs.some((run) => !isTerminalAgentRunStatus(run.status)))
				throw new Error('Run did not settle');
		});
	}
});

it('uses native vision when the same trusted deployment model fills both roles', async () => {
	const fixture = setup({ defaultModel: 'test/multimodal', defaultVisionModel: 'test/multimodal' });
	await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Read this',
		contextImages: [image]
	});
	const run = fixture.runs.runs[0];
	if (run?.kind !== 'agent') throw new Error('Expected a saved chat run');
	expect(run.inputSnapshot.visionModelOverride).toBeUndefined();
});

it('retains the configured reader for a text-only chat model', async () => {
	const fixture = setup();
	await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Read this',
		contextImages: [image]
	});
	const run = fixture.runs.runs[0];
	if (run?.kind !== 'agent') throw new Error('Expected a saved chat run');
	expect(run.inputSnapshot.visionModelOverride).toBe('openai/test-vision-model');
});

it('keeps provider capabilities authoritative over configured roles', async () => {
	const fixture = setup({ defaultModel: 'test/multimodal', defaultVisionModel: 'test/multimodal' });
	fixture.models.models = [
		{
			id: 'test/multimodal',
			name: 'Configured model',
			provider: 'test',
			supportsTools: true,
			supportsVision: false,
			recommended: false,
			capabilities: []
		}
	];
	await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Read this',
		images: [image]
	});
	const run = fixture.runs.runs[0];
	if (run?.kind !== 'agent') throw new Error('Expected a saved chat run');
	expect(run.inputSnapshot.visionModelOverride).toBe('test/multimodal');
});

it('does not leave a conversation or run when the image model catalog fails', async () => {
	const fixture = setup();
	fixture.models.failure = new Error('Catalog unavailable');
	const outcome = await fixture.controller
		.submit(testActor(), { requestId: crypto.randomUUID(), input: 'Read this', images: [image] })
		.then(
			() => 'unexpected success',
			(error) => {
				if (!(error instanceof Error)) throw error;
				return error.message;
			}
		);
	expect({
		outcome,
		runs: fixture.runs.runs.length,
		conversations: fixture.conversations.conversations.length
	}).toEqual({ outcome: 'Catalog unavailable', runs: 0, conversations: 0 });
});

it('does not fetch image capabilities for a turn without images', async () => {
	const fixture = setup();
	fixture.models.failure = new Error('Image catalog must not be read');
	await fixture.controller.submit(testActor(), { requestId: crypto.randomUUID(), input: 'Hello' });
	expect(fixture.runs.runs[0]?.status).toBe('queued');
});

it('rejects the combined image count before saving a conversation', async () => {
	const fixture = setup();
	await expect(
		fixture.controller.submit(testActor(), {
			requestId: crypto.randomUUID(),
			input: 'Read these',
			images: Array.from({ length: 3 }, () => ({ ...image, id: crypto.randomUUID() })),
			contextImages: Array.from({ length: 2 }, () => ({ ...image, id: crypto.randomUUID() }))
		})
	).rejects.toThrow('at most four');
});
