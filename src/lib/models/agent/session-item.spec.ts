import { describe, expect, it } from 'vitest';
import { persistedSessionItemSchema, storedSessionItemSchema } from './session-item';

const storedUser = { type: 'message', role: 'user', content: 'Summarise this' };
const storedAssistant = {
	type: 'message',
	role: 'assistant',
	id: 'msg-1',
	status: 'completed',
	content: [{ type: 'output_text', text: 'Here you go', providerData: { annotations: [] } }]
};
const storedCall = {
	type: 'function_call',
	name: 'search',
	callId: 'call-1',
	arguments: '{"query":"notes"}'
};
const storedResult = {
	type: 'function_call_result',
	name: 'search',
	callId: 'call-1',
	status: 'completed',
	output: { type: 'text', text: '{"hits":0}' }
};
const storedReasoning = {
	type: 'reasoning',
	content: [],
	rawContent: [{ type: 'reasoning_text', text: 'thinking' }]
};

describe('reading a stored session item', () => {
	it('reads a user message', () => {
		expect(persistedSessionItemSchema.parse(storedUser)).toMatchObject({
			type: 'user_message',
			content: 'Summarise this'
		});
	});

	it('reads a user message that carries an image part', () => {
		const item = persistedSessionItemSchema.parse({
			role: 'user',
			content: [{ type: 'input_image', image: 'https://example.test/a.png' }]
		});
		const content = item.type === 'user_message' ? item.content : '';
		expect(typeof content === 'string' ? undefined : content[0]?.type).toBe('input_image');
	});

	it('reads assistant text and preserves the provider bag it does not interpret', () => {
		const item = persistedSessionItemSchema.parse(storedAssistant);
		expect(item).toMatchObject({
			type: 'assistant_message',
			content: [{ type: 'output_text', text: 'Here you go', providerData: { annotations: [] } }]
		});
	});

	it('reads a function call', () => {
		expect(persistedSessionItemSchema.parse(storedCall).type).toBe('function_call');
	});

	it('reads a function call result', () => {
		expect(persistedSessionItemSchema.parse(storedResult).type).toBe('function_call_result');
	});

	it('reads a reasoning item', () => {
		expect(persistedSessionItemSchema.parse(storedReasoning).type).toBe('reasoning');
	});

	// The replay virtualizer read `callId` or `call_id` and hashed the item when it
	// found neither. Normalising here is what lets that fallback go.
	it('accepts the snake-case call id a legacy row carries', () => {
		const item = persistedSessionItemSchema.parse({
			type: 'function_call',
			name: 'search',
			call_id: 'call-legacy',
			arguments: '{}'
		});
		expect(item.type === 'function_call' && item.callId).toBe('call-legacy');
	});

	it('refuses a tool call with no call id at all', () => {
		const item = persistedSessionItemSchema.parse({
			type: 'function_call',
			name: 'search',
			arguments: '{}'
		});
		expect(item.type).toBe('unrecognised');
	});
});

describe('an item no arm recognises', () => {
	it('settles an unrecognised compaction item with a readable type reason', () => {
		const item = persistedSessionItemSchema.parse({ type: 'compaction', summary: 'earlier turns' });
		expect(item.type === 'unrecognised' && item.reason).toContain('compaction');
	});

	// A row with an unmodelled *field* is as unreadable as one with an unmodelled
	// type, and must not be silently stripped down to the fields that did parse.
	it('does not quietly drop a field an arm has no place for', () => {
		expect(persistedSessionItemSchema.parse({ ...storedCall, namespace: 'mcp' }).type).toBe(
			'unrecognised'
		);
	});

	it('throws when the column does not hold a JSON object at all', () => {
		expect(() => persistedSessionItemSchema.parse('not an item')).toThrow('Invalid input');
	});
});

describe('writing a session item back', () => {
	it('leaves an absent optional absent rather than writing an undefined', () => {
		expect(
			Object.keys(storedSessionItemSchema.parse(persistedSessionItemSchema.parse(storedUser)))
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
		expect(storedSessionItemSchema.parse(item)).toEqual({
			type: 'function_call',
			name: 'search',
			callId: 'call-legacy',
			arguments: '{}'
		});
	});

	it.each([
		['a user message', storedUser],
		['an assistant message', storedAssistant],
		['a function call', storedCall],
		['a function call result', storedResult],
		['a reasoning item', storedReasoning],
		['an unrecognised compaction item', { type: 'compaction', summary: 'kept whole' }]
	])('writes %s back exactly as it was stored', (_name, stored) => {
		expect(storedSessionItemSchema.parse(persistedSessionItemSchema.parse(stored))).toEqual(stored);
	});
});
