import { describe, it, expect } from 'vitest';
import { readInlineSuggestionResponse } from './inline-suggestion-response';

const json = (body: object, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});

const grounding = { currentNote: true, userMemoryCount: 0, projectPassageCount: 2 };

describe('readInlineSuggestionResponse', () => {
	it('offers the suggested text', async () => {
		const result = await readInlineSuggestionResponse(
			json({ outcome: 'suggested', text: ' to avoid data loss.', grounding })
		);
		expect(result).toEqual({
			kind: 'offer',
			edit: { kind: 'insert', text: ' to avoid data loss.' }
		});
	});

	it('reads a declined suggestion as none', async () => {
		const result = await readInlineSuggestionResponse(
			json({ outcome: 'no_suggestion', reason: 'empty_model' })
		);
		expect(result).toEqual({ kind: 'none' });
	});

	it('reads a rate limit as a retry after its own wait', async () => {
		const result = await readInlineSuggestionResponse(
			json({ outcome: 'rate_limited', retryAfterMs: 42_000 }, 429)
		);
		expect(result).toEqual({ kind: 'retry', afterMs: 42_000 });
	});

	it('reports a provider failure instead of guessing', async () => {
		const result = await readInlineSuggestionResponse(json({ outcome: 'provider_failure' }, 502));
		expect(result).toEqual({
			kind: 'failure',
			message: 'Writing suggestion failed with status 502.'
		});
	});

	it('reports a body that is not JSON', async () => {
		const result = await readInlineSuggestionResponse(
			new Response('<html>Service unavailable</html>', { status: 503 })
		);
		expect(result).toEqual({
			kind: 'failure',
			message: 'Writing suggestion answer could not be read (status 503).'
		});
	});
});
