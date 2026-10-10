import { describe, expect, it } from 'vitest';
import { withReasoning } from './reasoning-transport';

class RecordingFetch {
	body: unknown;

	fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		this.body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
		return new Response('{}', { status: 200 });
	};
}

const send = async (url: string, body: unknown) => {
	const recorder = new RecordingFetch();
	await withReasoning(recorder.fetch)(url, { method: 'POST', body: JSON.stringify(body) });
	return recorder.body as Record<string, unknown>;
};

const COMPLETIONS = 'https://openrouter.ai/api/v1/chat/completions';

describe('Asking OpenRouter to stream reasoning', () => {
	// Without this the per-token channel never fires and reasoning arrives as one
	// block after each generation instead of typing itself out.
	it('asks for reasoning on a generation that did not', async () => {
		expect((await send(COMPLETIONS, { model: 'x' })).reasoning).toEqual({ enabled: true });
	});

	it('leaves the rest of the request alone', async () => {
		expect((await send(COMPLETIONS, { model: 'x', tools: ['a'] })).tools).toEqual(['a']);
	});

	// A caller that named an effort level has said what it wants; a blanket "on"
	// would quietly overrule it.
	it('keeps a reasoning setting the caller already chose', async () => {
		const body = await send(COMPLETIONS, { model: 'x', reasoning: { effort: 'high' } });
		expect(body.reasoning).toEqual({ effort: 'high' });
	});

	it('keeps a caller decision to turn reasoning off', async () => {
		const body = await send(COMPLETIONS, { model: 'x', reasoning: { enabled: false } });
		expect(body.reasoning).toEqual({ enabled: false });
	});

	it('leaves requests that are not generations untouched', async () => {
		expect((await send('https://openrouter.ai/api/v1/models', { model: 'x' })).reasoning).toBe(
			undefined
		);
	});
});
