import { describe, expect, it } from 'vitest';
import {
	AgentProviderFailure,
	parseProviderStreamEvent,
	parseProviderToolCall,
	unwrapDispatchedToolCall,
	type ProviderStreamEvent
} from './index';

/**
 * The item shape the SDK emits: the facts live on `item.rawItem`, a declared
 * property of every `RunItem` subclass. `callId` and `toolName` are accessors
 * that derive from the same `rawItem`, so nothing here reads them twice.
 */
const streamed = (name: string, rawItem: Readonly<Record<string, unknown>>): ProviderStreamEvent =>
	parseProviderStreamEvent({ type: 'run_item_stream_event', name, item: { rawItem } });

const call = (rawItem: Readonly<Record<string, unknown>>) => {
	const event = streamed('tool_called', { type: 'function_call', name: 'save_note', ...rawItem });
	return event.type === 'tool_called' ? event.call : undefined;
};

describe('Provider tool call identity', () => {
	it('prefers callId over the other two spellings', () => {
		expect(call({ callId: 'a', call_id: 'b', id: 'c' })?.callId).toBe('a');
	});

	it('falls back to call_id when callId is absent', () => {
		expect(call({ call_id: 'b', id: 'c' })?.callId).toBe('b');
	});

	it('falls back to id when neither spelling is present', () => {
		expect(call({ id: 'c' })?.callId).toBe('c');
	});

	it('reports no id rather than coercing a non-string one', () => {
		expect(call({ callId: { value: 'c' } })?.callId).toBeUndefined();
	});

	it('reports no id rather than an empty string when the provider sent none', () => {
		expect(call({})?.callId).toBeUndefined();
	});
});

describe('Provider tool call arguments', () => {
	it('parses JSON-text arguments into an object', () => {
		expect(call({ callId: 'a', arguments: '{"title":"Decision log"}' })?.arguments).toEqual({
			title: 'Decision log'
		});
	});

	it('reports no arguments when the provider sent none', () => {
		expect(call({ callId: 'a' })?.arguments).toEqual({});
	});

	it('rejects malformed JSON arguments as a provider failure', () => {
		expect(() => call({ callId: 'a', arguments: '{' })).toThrowError(AgentProviderFailure);
	});

	it('rejects arguments that are not an object as a provider failure', () => {
		expect(() => call({ callId: 'a', arguments: '[]' })).toThrowError(AgentProviderFailure);
	});
});

describe('Legacy use_tool envelopes', () => {
	it('presents the dispatched call under its inner name', () => {
		expect(
			call({
				callId: 'a',
				name: 'use_tool',
				arguments: JSON.stringify({ name: 'create_note', payload: { title: 'Log' } })
			})?.name
		).toBe('create_note');
	});

	it('presents the inner payload as the call arguments', () => {
		expect(
			call({
				callId: 'a',
				name: 'use_tool',
				arguments: JSON.stringify({ name: 'create_note', payload: { title: 'Log' } })
			})?.arguments
		).toEqual({ title: 'Log' });
	});

	it('accepts a payload the model sent as a JSON string', () => {
		expect(
			call({
				callId: 'a',
				name: 'use_tool',
				arguments: JSON.stringify({ name: 'create_note', payload: '{"title":"Log"}' })
			})?.arguments
		).toEqual({ title: 'Log' });
	});

	it('leaves an envelope without an inner name as the envelope', () => {
		expect(call({ callId: 'a', name: 'use_tool', arguments: '{}' })?.name).toBe('use_tool');
	});

	it('names the dispatched tool from a stored transcript call', () => {
		expect(
			unwrapDispatchedToolCall('use_tool', JSON.stringify({ name: 'search_notes', payload: {} }))
				?.name
		).toBe('search_notes');
	});

	it('reports nothing for a call that was already direct', () => {
		expect(unwrapDispatchedToolCall('search_notes', '{}')).toBeUndefined();
	});
});

describe('Provider tool call output', () => {
	it('reports a readable result as a value', () => {
		expect(call({ callId: 'a', output: '{"noteId":"n1"}' })?.output).toEqual({
			kind: 'value',
			value: '{"noteId":"n1"}'
		});
	});

	it('reports an absent result as none rather than as an empty value', () => {
		expect(call({ callId: 'a' })?.output).toEqual({ kind: 'none' });
	});

	it('reports a result JSON cannot carry as corrupt rather than as an empty object', () => {
		expect(call({ callId: 'a', output: { when: new Date(0) } })?.output.kind).toBe('corrupt');
	});
});

describe('Provider stream event arms', () => {
	it('reads a tool call as its own arm', () => {
		expect(streamed('tool_called', { type: 'function_call', name: 'x', callId: 'a' }).type).toBe(
			'tool_called'
		);
	});

	it('reads a tool outcome as its own arm', () => {
		expect(
			streamed('tool_output', { type: 'function_call_result', name: 'x', callId: 'a' }).type
		).toBe('tool_output');
	});

	it('reads reasoning text from rawContent', () => {
		expect(
			streamed('reasoning_item_created', {
				type: 'reasoning',
				rawContent: [{ type: 'reasoning_text', text: 'Checking the workspace.' }]
			})
		).toEqual({ type: 'reasoning_item', text: 'Checking the workspace.' });
	});

	it('reads reasoning text from content when rawContent is absent', () => {
		expect(
			streamed('reasoning_item_created', {
				type: 'reasoning',
				content: [{ type: 'input_text', text: 'Reading the note.' }]
			})
		).toEqual({ type: 'reasoning_item', text: 'Reading the note.' });
	});

	it('reads reasoning text from summary when the other two are absent', () => {
		expect(
			streamed('reasoning_item_created', {
				type: 'reasoning',
				summary: [{ type: 'summary_text', text: 'Summarising.' }]
			})
		).toEqual({ type: 'reasoning_item', text: 'Summarising.' });
	});

	it('joins several reasoning parts into one text', () => {
		expect(
			streamed('reasoning_item_created', {
				type: 'reasoning',
				rawContent: [{ text: 'One.' }, { text: 'Two.' }]
			})
		).toEqual({ type: 'reasoning_item', text: 'One.\nTwo.' });
	});

	it('reads a reasoning delta off the raw provider chunk', () => {
		expect(
			parseProviderStreamEvent({
				type: 'raw_model_stream_event',
				data: { type: 'model', event: { choices: [{ delta: { reasoning: 'Thinking.' } }] } }
			})
		).toEqual({ type: 'reasoning_delta', text: 'Thinking.' });
	});

	it('ignores a raw chunk whose reasoning field is null', () => {
		expect(
			parseProviderStreamEvent({
				type: 'raw_model_stream_event',
				data: { type: 'model', event: { choices: [{ delta: { reasoning: null } }] } }
			})
		).toEqual({ type: 'ignored' });
	});

	it('reads visible text as a delta', () => {
		expect(
			parseProviderStreamEvent({
				type: 'raw_model_stream_event',
				data: { type: 'output_text_delta', delta: 'Hello' }
			})
		).toEqual({ type: 'text_delta', text: 'Hello' });
	});

	it('settles an SDK event this union does not model as ignored', () => {
		expect(
			parseProviderStreamEvent({
				type: 'run_item_stream_event',
				name: 'handoff_requested',
				item: { rawItem: { type: 'function_call', name: 'x', callId: 'a' } }
			})
		).toEqual({ type: 'ignored' });
	});

	it('settles an event of an unknown kind as ignored rather than failing the turn', () => {
		expect(parseProviderStreamEvent({ type: 'agent_updated_stream_event' })).toEqual({
			type: 'ignored'
		});
	});
});

describe('Parked provider tool calls', () => {
	it('reads an interruption held outside the stream', () => {
		expect(
			parseProviderToolCall({
				rawItem: { type: 'function_call', callId: 'call-1', name: 'delete_note' },
				toolName: 'delete_note'
			})?.callId
		).toBe('call-1');
	});

	it('prefers the explicit tool name an approval item carries', () => {
		expect(
			parseProviderToolCall({
				rawItem: { type: 'hosted_tool_call', callId: 'call-1' },
				toolName: 'delete_note'
			})?.name
		).toBe('delete_note');
	});

	it('reports nothing for a value that is not a tool item at all', () => {
		expect(parseProviderToolCall('not an item')).toBeUndefined();
	});
});
