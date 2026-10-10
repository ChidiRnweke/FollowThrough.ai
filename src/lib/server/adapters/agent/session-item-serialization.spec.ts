import corpus from '../../../../../tests/corpus/agent-session-items.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { persistedSessionItemSchema } from '$lib/models/agent';
import { createSessionItemSerialization } from '$lib/server/factories/agent/session-item-serialization-factory';

const serialization = createSessionItemSerialization();
const storedUser = { type: 'message', role: 'user', content: 'Summarise this' };

describe('writing a session item back', () => {
	it('leaves an absent optional absent rather than writing an undefined', () => {
		expect(
			Object.keys(serialization.serialize(persistedSessionItemSchema.parse(storedUser)))
		).not.toContain('id');
	});

	// `call_id` is normalised on the way in, so the row is rewritten in the
	// spelling everything downstream now uses.
	it('writes a normalised call id back in one spelling', () => {
		const item = persistedSessionItemSchema.parse({
			type: 'function_call',
			name: 'search',
			call_id: 'call-legacy',
			arguments: '{}'
		});
		expect(serialization.serialize(item)).toEqual({
			type: 'function_call',
			name: 'search',
			callId: 'call-legacy',
			arguments: '{}'
		});
	});
});

describe('provider protocol serialization', () => {
	it.each([
		{
			type: 'message',
			role: 'user',
			content: [{ type: 'input_image', image: 'https://example.test/a.png' }]
		},
		{
			type: 'message',
			role: 'assistant',
			status: 'completed',
			content: [{ type: 'output_text', text: '' }]
		},
		{
			type: 'function_call',
			callId: 'call-1',
			name: 'search',
			arguments: '{}',
			status: 'in_progress'
		},
		{
			type: 'function_call_result',
			callId: 'call-1',
			name: 'search',
			status: 'completed',
			output: { type: 'text', text: '' }
		},
		{
			type: 'function_call_result',
			callId: 'call-1',
			name: 'search',
			status: 'completed',
			output: ''
		},
		{
			type: 'function_call_result',
			callId: 'call-1',
			name: 'search',
			status: 'completed',
			output: [
				{ type: 'text', text: 'one' },
				{ type: 'text', text: 'two' }
			]
		},
		{ type: 'reasoning', content: [], rawContent: [{ type: 'reasoning_text', text: 'Thinking' }] },
		{
			type: 'compaction',
			summary: 'Earlier turns',
			metadata: { empty: '', nil: null, off: false, zero: 0 }
		}
	])('preserves $type payloads and provider metadata', (wire) => {
		const stored = {
			...wire,
			id: 'provider-id',
			providerData: { nested: [null, false, 0, ''], source: 'fixture' }
		};
		expect(serialization.serialize(persistedSessionItemSchema.parse(stored))).toEqual(stored);
	});
});

it('preserves the captured provider session corpus through parsing and serialization', () => {
	expect(
		corpus.map((item) => serialization.serialize(persistedSessionItemSchema.parse(item)))
	).toEqual(corpus);
});
