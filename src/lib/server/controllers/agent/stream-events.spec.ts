import { AgentProviderFailure } from '$lib/errors';
import type { ProviderStreamEvent } from '$lib/models/agent';
import { parseProviderStreamEvent } from '$lib/server/adapters/agent/provider-events';
import { createAgentStream } from '$lib/server/factories/agent/stream-factory';
import { describe, expect, it } from 'vitest';
const streamedItem = (
	name: 'tool_called' | 'tool_output',
	rawItem: Readonly<Record<string, unknown>>
): ProviderStreamEvent =>
	parseProviderStreamEvent({ type: 'run_item_stream_event', name, item: { rawItem } });
const toolCalled = (rawItem: Readonly<Record<string, unknown>>): ProviderStreamEvent =>
	streamedItem('tool_called', { type: 'function_call', ...rawItem });
const toolOutput = (rawItem: Readonly<Record<string, unknown>>): ProviderStreamEvent =>
	streamedItem('tool_output', { type: 'function_call_result', ...rawItem });
const reasoningItem = (text: string): ProviderStreamEvent =>
	parseProviderStreamEvent({
		type: 'run_item_stream_event',
		name: 'reasoning_item_created',
		item: { rawItem: { type: 'reasoning', rawContent: [{ type: 'reasoning_text', text }] } }
	});
describe('Agent tool event invariants', () => {
	it('maps an SDK tool call to a domain start event', () => {
		const event = createAgentStream().tools.map(
			toolCalled({ callId: 'call-1', name: 'relate_selection' })
		);
		expect(event).toEqual({
			type: 'tool_started',
			callId: 'call-1',
			name: 'relate_selection',
			arguments: {}
		});
	});

	it('refuses to key a call the provider opened without an identifier', () => {
		const mapAnonymousCall = () => createAgentStream().tools.map(toolCalled({ name: 'save_note' }));
		expect(mapAnonymousCall).toThrowError(AgentProviderFailure);
	});

	/**
	 * The SDK resolves every call against the tools this run handed it and answers
	 * an unknown name with its own `Tool not found` before any event is emitted, so
	 * a name arriving here that the agent surface does not have means the registry
	 * and the tools given to the SDK have diverged. That is a bug in this process,
	 * not something the model did, and `tool_started` has no failure arm to settle
	 * it into: the call did start, and inventing an outcome for it would be the
	 * quiet wrong answer.
	 */
	it('refuses a call to a name the agent surface does not have', () => {
		const mapUnknownCall = () =>
			createAgentStream().tools.map(toolCalled({ callId: 'call-1', name: 'save_notes' }));
		expect(mapUnknownCall).toThrowError(AgentProviderFailure);
	});

	it('accepts search_tools, which is built rather than defined and has no catalog entry', () => {
		const event = createAgentStream().tools.map(
			toolCalled({ callId: 'call-1', name: 'search_tools' })
		);
		expect(event).toEqual({
			type: 'tool_started',
			callId: 'call-1',
			name: 'search_tools',
			arguments: {}
		});
	});

	it('preserves the tool name when mapping its SDK output event', () => {
		const mapper = createAgentStream().tools;
		mapper.map(toolCalled({ callId: 'call-1', name: 'find_references' }));
		const event = mapper.map(toolOutput({ callId: 'call-1' }));
		expect(event).toEqual({ type: 'tool_succeeded', callId: 'call-1', name: 'find_references' });
	});

	/**
	 * The value the tool returned rides along on this arm. It used to sit beside the
	 * failure as a second optional, and both readers branched on the failure first and
	 * dropped it — on 30 of the 147 rows the run had stored.
	 */
	it('maps a failure the tool returned as a value, keeping the value', () => {
		const event = createAgentStream().tools.map(
			toolOutput({
				callId: 'call-2',
				name: 'create_note',
				output:
					'{"kind":"failure","code":"OWNERSHIP","message":"Denied","recovery":"Stop.","details":{}}'
			})
		);
		expect(event).toEqual({
			type: 'tool_reported_failure',
			callId: 'call-2',
			name: 'create_note',
			failure: 'Denied',
			output:
				'{"kind":"failure","code":"OWNERSHIP","message":"Denied","recovery":"Stop.","details":{}}'
		});
	});

	it('settles an unreadable tool result as a failure rather than an empty success', () => {
		const event = createAgentStream().tools.map({
			type: 'tool_output',
			call: {
				callId: 'call-9',
				name: 'get_note',
				arguments: {},
				output: { kind: 'corrupt', message: 'root.when is a Date' }
			}
		});
		expect(event).toMatchObject({
			type: 'tool_failed',
			failure: expect.stringContaining('Date')
		});
	});

	it('preserves a direct tool action name through its full event lifecycle', () => {
		const mapper = createAgentStream().tools;
		const started = mapper.map(
			toolCalled({
				callId: 'call-3',
				name: 'create_note',
				arguments: JSON.stringify({ title: 'Decision log' })
			})
		);
		const succeeded = mapper.map(toolOutput({ callId: 'call-3', name: 'create_note' }));
		expect({ started, succeeded }).toEqual({
			started: {
				type: 'tool_started',
				callId: 'call-3',
				name: 'create_note',
				arguments: { title: 'Decision log' }
			},
			succeeded: { type: 'tool_succeeded', callId: 'call-3', name: 'create_note' }
		});
	});

	it('settles an outcome without an id onto the one call in flight', () => {
		const mapper = createAgentStream().tools;
		mapper.map(toolCalled({ callId: 'call-5', name: 'search' }));
		const event = mapper.map(toolOutput({ name: 'search' }));
		expect(event).toEqual({ type: 'tool_succeeded', callId: 'call-5', name: 'search' });
	});

	it('reports no call id when an outcome without one meets several calls in flight', () => {
		const mapper = createAgentStream().tools;
		mapper.map(toolCalled({ callId: 'call-6', name: 'search' }));
		mapper.map(toolCalled({ callId: 'call-7', name: 'get_note' }));
		const event = mapper.map(toolOutput({ name: 'get_note' }));
		expect(event).toEqual({ type: 'tool_succeeded', name: 'get_note' });
	});

	it('reports no call id when an outcome without one meets no call in flight', () => {
		const event = createAgentStream().tools.map(toolOutput({ name: 'get_note' }));
		expect(event).toEqual({ type: 'tool_succeeded', name: 'get_note' });
	});

	it('does not settle a second call onto the first when the outcome names its own', () => {
		const mapper = createAgentStream().tools;
		mapper.map(toolCalled({ callId: 'call-8', name: 'search' }));
		const event = mapper.map(toolOutput({ callId: 'call-unknown', name: 'get_note' }));
		expect(event).toEqual({ type: 'tool_succeeded', callId: 'call-unknown', name: 'get_note' });
	});
});
describe('Agent reasoning event invariants', () => {
	it('maps reasoning on a raw provider chunk to a delta event', () => {
		const event = createAgentStream().reasoning.map(
			parseProviderStreamEvent({
				type: 'raw_model_stream_event',
				data: {
					type: 'model',
					event: { choices: [{ delta: { reasoning: 'Let me check the workspace first.' } }] }
				}
			})
		);
		expect(event).toEqual({
			type: 'reasoning_delta',
			text: 'Let me check the workspace first.'
		});
	});

	it('ignores raw chunks without reasoning', () => {
		const event = createAgentStream().reasoning.map(
			parseProviderStreamEvent({
				type: 'raw_model_stream_event',
				data: { type: 'model', event: { choices: [{ delta: { content: 'visible text' } }] } }
			})
		);
		expect(event).toBeUndefined();
	});

	it('dedupes the completed reasoning item after streamed deltas', () => {
		const mapper = createAgentStream().reasoning;
		mapper.map({ type: 'reasoning_delta', text: 'Thinking…' });
		const event = mapper.map(reasoningItem('Thinking…'));
		expect(event).toBeUndefined();
	});

	it('emits the completed reasoning item when no deltas were streamed', () => {
		const event = createAgentStream().reasoning.map(reasoningItem('The user wants a note.'));
		expect(event).toEqual({ type: 'reasoning_delta', text: 'The user wants a note.' });
	});

	it('emits nothing for a reasoning item without text', () => {
		const event = createAgentStream().reasoning.map(
			parseProviderStreamEvent({
				type: 'run_item_stream_event',
				name: 'reasoning_item_created',
				item: { rawItem: { type: 'reasoning', content: [] } }
			})
		);
		expect(event).toBeUndefined();
	});

	it('resumes emitting items after a deduped generation', () => {
		const mapper = createAgentStream().reasoning;
		mapper.map({ type: 'reasoning_delta', text: 'Step one.' });
		mapper.map(reasoningItem('Step one.'));
		const event = mapper.map(
			parseProviderStreamEvent({
				type: 'run_item_stream_event',
				name: 'reasoning_item_created',
				item: {
					rawItem: { type: 'reasoning', summary: [{ type: 'summary_text', text: 'Step two.' }] }
				}
			})
		);
		expect(event).toEqual({ type: 'reasoning_delta', text: 'Step two.' });
	});
});
