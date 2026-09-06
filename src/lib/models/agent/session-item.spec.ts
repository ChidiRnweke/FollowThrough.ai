import { describe, expect, it } from 'vitest';
import {
	parseSessionItem,
	sessionOutputText,
	toStoredSessionItem,
	type FunctionCallResultSessionItem
} from './session-item';

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
		expect(parseSessionItem(storedUser).type).toBe('user_message');
	});

	it('reads a user message that carries an image part', () => {
		const item = parseSessionItem({
			role: 'user',
			content: [{ type: 'input_image', image: 'https://example.test/a.png' }]
		});
		const content = item.type === 'user_message' ? item.content : '';
		expect(typeof content === 'string' ? undefined : content[0]?.type).toBe('input_image');
	});

	it('reads an assistant message', () => {
		expect(parseSessionItem(storedAssistant).type).toBe('assistant_message');
	});

	it('keeps the provider bag it does not read', () => {
		const item = parseSessionItem(storedAssistant);
		expect(item.type === 'assistant_message' && item.content[0]?.providerData).toEqual({
			annotations: []
		});
	});

	it('reads a function call', () => {
		expect(parseSessionItem(storedCall).type).toBe('function_call');
	});

	it('reads a function call result', () => {
		expect(parseSessionItem(storedResult).type).toBe('function_call_result');
	});

	it('reads a reasoning item', () => {
		expect(parseSessionItem(storedReasoning).type).toBe('reasoning');
	});

	// The replay virtualizer read `callId` or `call_id` and hashed the item when it
	// found neither. Normalising here is what lets that fallback go.
	it('accepts the snake-case call id a legacy row carries', () => {
		const item = parseSessionItem({
			type: 'function_call',
			name: 'search',
			call_id: 'call-legacy',
			arguments: '{}'
		});
		expect(item.type === 'function_call' && item.callId).toBe('call-legacy');
	});

	it('refuses a tool call with no call id at all', () => {
		const item = parseSessionItem({ type: 'function_call', name: 'search', arguments: '{}' });
		expect(item.type).toBe('unrecognised');
	});
});

describe('an item no arm recognises', () => {
	it('settles rather than throwing, so the conversation stays readable', () => {
		expect(parseSessionItem({ type: 'compaction', summary: 'earlier turns' }).type).toBe(
			'unrecognised'
		);
	});

	it('says which type it could not read', () => {
		const item = parseSessionItem({ type: 'compaction' });
		expect(item.type === 'unrecognised' && item.reason).toContain('compaction');
	});

	// A row with an unmodelled *field* is as unreadable as one with an unmodelled
	// type, and must not be silently stripped down to the fields that did parse.
	it('does not quietly drop a field an arm has no place for', () => {
		expect(parseSessionItem({ ...storedCall, namespace: 'mcp' }).type).toBe('unrecognised');
	});

	it('throws when the column does not hold a JSON object at all', () => {
		expect(() => parseSessionItem('not an item')).toThrow(/must be a JSON object/);
	});
});

describe('writing a session item back', () => {
	it('leaves an absent optional absent rather than writing an undefined', () => {
		expect(Object.keys(toStoredSessionItem(parseSessionItem(storedUser)))).not.toContain('id');
	});

	// `call_id` is normalised on the way in, so the row is rewritten in the
	// spelling everything downstream now uses.
	it('writes a normalised call id back in one spelling', () => {
		const item = parseSessionItem({
			type: 'function_call',
			name: 'search',
			call_id: 'call-legacy',
			arguments: '{}'
		});
		expect(toStoredSessionItem(item)).toEqual({
			type: 'function_call',
			name: 'search',
			callId: 'call-legacy',
			arguments: '{}'
		});
	});
});

describe('the text a tool result carries', () => {
	const result = (output: FunctionCallResultSessionItem['output']) =>
		sessionOutputText({
			type: 'function_call_result',
			name: 'search',
			callId: 'call-1',
			status: 'completed',
			output
		});

	it('reads the bare string form', () => {
		expect(result('done')).toBe('done');
	});

	it('reads the text part form', () => {
		expect(result({ type: 'text', text: 'done' })).toBe('done');
	});

	it('reports nothing for the multi-part form, which carries no single text', () => {
		expect(result([{ type: 'text', text: 'first' }])).toBeUndefined();
	});
});
