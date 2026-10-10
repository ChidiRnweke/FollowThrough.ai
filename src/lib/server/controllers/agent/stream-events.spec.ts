import { AgentProviderFailure } from '$lib/errors';
import type { ProviderStreamEvent } from '$lib/models/agent';
import { parseProviderStreamEvent } from '$lib/server/adapters/agent/provider-events';
import { streamExecutionFixture } from '$lib/testing/agent/fixtures/stream-execution';
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
	it('maps an SDK tool call to a domain start event', async () => {
		const event = await eventSequence().map(
			toolCalled({ callId: 'call-1', name: 'relate_selection' })
		);
		expect(event).toEqual({
			type: 'tool_started',
			callId: 'call-1',
			name: 'relate_selection',
			arguments: {}
		});
	});

	it('refuses to key a call the provider opened without an identifier', async () => {
		const mapAnonymousCall = async () =>
			await eventSequence().map(toolCalled({ name: 'save_note' }));
		await expect(mapAnonymousCall()).rejects.toThrowError(AgentProviderFailure);
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
	it('refuses a call to a name the agent surface does not have', async () => {
		const mapUnknownCall = async () =>
			await eventSequence().map(toolCalled({ callId: 'call-1', name: 'save_notes' }));
		await expect(mapUnknownCall()).rejects.toThrowError(AgentProviderFailure);
	});

	it('accepts search_tools, which is built rather than defined and has no catalog entry', async () => {
		const event = await eventSequence().map(toolCalled({ callId: 'call-1', name: 'search_tools' }));
		expect(event).toEqual({
			type: 'tool_started',
			callId: 'call-1',
			name: 'search_tools',
			arguments: {}
		});
	});

	it('preserves the tool name when mapping its SDK output event', async () => {
		const mapper = eventSequence();
		await mapper.map(toolCalled({ callId: 'call-1', name: 'find_references' }));
		const event = await mapper.map(toolOutput({ callId: 'call-1' }));
		expect(event).toEqual({ type: 'tool_succeeded', callId: 'call-1', name: 'find_references' });
	});

	/**
	 * The value the tool returned rides along on this arm. It used to sit beside the
	 * failure as a second optional, and both readers branched on the failure first and
	 * dropped it — on 30 of the 147 rows the run had stored.
	 */
	it('maps a failure the tool returned as a value, keeping the value', async () => {
		const event = await eventSequence().map(
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

	it('settles an unreadable tool result as a failure rather than an empty success', async () => {
		const event = await eventSequence().map({
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

	it('preserves a direct tool action name through its full event lifecycle', async () => {
		const mapper = eventSequence();
		const started = await mapper.map(
			toolCalled({
				callId: 'call-3',
				name: 'create_note',
				arguments: JSON.stringify({ title: 'Decision log' })
			})
		);
		const succeeded = await mapper.map(toolOutput({ callId: 'call-3', name: 'create_note' }));
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

	it('settles an outcome without an id onto the one call in flight', async () => {
		const mapper = eventSequence();
		await mapper.map(toolCalled({ callId: 'call-5', name: 'search' }));
		const event = await mapper.map(toolOutput({ name: 'search' }));
		expect(event).toEqual({ type: 'tool_succeeded', callId: 'call-5', name: 'search' });
	});

	it('reports no call id when an outcome without one meets several calls in flight', async () => {
		const mapper = eventSequence();
		await mapper.map(toolCalled({ callId: 'call-6', name: 'search' }));
		await mapper.map(toolCalled({ callId: 'call-7', name: 'get_note' }));
		const event = await mapper.map(toolOutput({ name: 'get_note' }));
		expect(event).toEqual({ type: 'tool_succeeded', name: 'get_note' });
	});

	it('reports no call id when an outcome without one meets no call in flight', async () => {
		const event = await eventSequence().map(toolOutput({ name: 'get_note' }));
		expect(event).toEqual({ type: 'tool_succeeded', name: 'get_note' });
	});

	it('does not settle a second call onto the first when the outcome names its own', async () => {
		const mapper = eventSequence();
		await mapper.map(toolCalled({ callId: 'call-8', name: 'search' }));
		const event = await mapper.map(toolOutput({ callId: 'call-unknown', name: 'get_note' }));
		expect(event).toEqual({ type: 'tool_succeeded', callId: 'call-unknown', name: 'get_note' });
	});
});
describe('Agent reasoning event invariants', () => {
	it('maps reasoning on a raw provider chunk to a delta event', async () => {
		const event = await eventSequence().map(
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

	it('ignores raw chunks without a mapped event', async () => {
		const event = await eventSequence().map(
			parseProviderStreamEvent({
				type: 'raw_model_stream_event',
				data: { type: 'model', event: { choices: [{ delta: { content: 'visible text' } }] } }
			})
		);
		expect(event).toBeUndefined();
	});

	it('dedupes the completed reasoning item after streamed deltas', async () => {
		const mapper = eventSequence();
		await mapper.map({ type: 'reasoning_delta', text: 'Thinking…' });
		const event = await mapper.map(reasoningItem('Thinking…'));
		expect(event).toBeUndefined();
	});

	it('emits the completed reasoning item when no deltas were streamed', async () => {
		const event = await eventSequence().map(reasoningItem('The user wants a note.'));
		expect(event).toEqual({ type: 'reasoning_delta', text: 'The user wants a note.' });
	});

	it('emits nothing for a reasoning item without text', async () => {
		const event = await eventSequence().map(
			parseProviderStreamEvent({
				type: 'run_item_stream_event',
				name: 'reasoning_item_created',
				item: { rawItem: { type: 'reasoning', content: [] } }
			})
		);
		expect(event).toBeUndefined();
	});

	it('resumes emitting items after a deduped generation', async () => {
		const mapper = eventSequence();
		await mapper.map({ type: 'reasoning_delta', text: 'Step one.' });
		await mapper.map(reasoningItem('Step one.'));
		const event = await mapper.map(
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

/** Each observation runs the complete operation over the supplied provider transcript. */
const eventSequence = () => {
	const events: ProviderStreamEvent[] = [];
	let count = 0;
	return {
		async map(event: ProviderStreamEvent) {
			events.push(event);
			const result = await streamExecutionFixture(events).collect();
			const next = result.length > count ? result.at(-1) : undefined;
			count = result.length;
			return next;
		}
	};
};

it('delivers the complete tool, reasoning and text sequence in provider order', async () => {
	const fixture = streamExecutionFixture([
		toolCalled({ callId: 'a', name: 'search' }),
		{ type: 'reasoning_delta', text: 'Look up context' },
		{ type: 'text_delta', text: 'Searching' },
		toolOutput({ callId: 'a', name: 'search' }),
		reasoningItem('Look up context'),
		reasoningItem('Now answer'),
		{ type: 'text_delta', text: 'Done' }
	]);
	expect(await fixture.collect()).toEqual([
		{ type: 'tool_started', callId: 'a', name: 'search', arguments: {} },
		{ type: 'reasoning_delta', text: 'Look up context' },
		{ type: 'text_delta', text: 'Searching' },
		{ type: 'tool_succeeded', callId: 'a', name: 'search' },
		{ type: 'reasoning_delta', text: 'Now answer' },
		{ type: 'text_delta', text: 'Done' }
	]);
});
it('keeps simultaneous executions on one owner from sharing correlation state', async () => {
	const fixture = streamExecutionFixture([]);
	fixture.infrastructure.queuedEvents.push(
		[toolCalled({ callId: 'left', name: 'search' })],
		[toolOutput({ name: 'get_note' })]
	);
	const [left, right] = await Promise.all([fixture.collect(), fixture.collect()]);
	expect({
		left,
		right,
		closed: fixture.infrastructure.providers.map((provider) => provider.closed)
	}).toEqual({
		left: [{ type: 'tool_started', callId: 'left', name: 'search', arguments: {} }],
		right: [{ type: 'tool_succeeded', name: 'get_note' }],
		closed: [true, true]
	});
});
