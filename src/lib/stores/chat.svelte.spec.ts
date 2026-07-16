import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '$lib/models';
import { chat } from './chat.svelte';

const ndjsonResponse = (events: AgentEvent[]): Response =>
	new Response(events.map((event) => JSON.stringify(event)).join('\n'), {
		status: 200,
		headers: { 'content-type': 'application/x-ndjson' }
	});

const streamedEvents: AgentEvent[] = [
	{ type: 'text_delta', text: 'Let me check. ' },
	{ type: 'tool_started', callId: 'call-1', name: 'find_references', arguments: { query: 'x' } },
	{ type: 'tool_completed', callId: 'call-1', name: 'find_references', output: { count: 2 } },
	{ type: 'text_delta', text: 'Found two.' }
];

const sendWith = async (events: AgentEvent[]) => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ndjsonResponse(events))
	);
	await chat.send({ prompt: 'look this up' });
	return chat.entries.at(-1)!;
};

describe('chat entry part ordering', () => {
	afterEach(() => {
		chat.clear();
		vi.unstubAllGlobals();
	});

	it('keeps tool calls inline between the text segments they arrived among', async () => {
		const reply = await sendWith(streamedEvents);
		expect(reply.parts.map((part) => part.kind)).toEqual(['text', 'tool', 'text']);
	});

	it('merges a tool completion into the inline part created by its start event', async () => {
		const reply = await sendWith(streamedEvents);
		const tool = reply.parts.find((part) => part.kind === 'tool');
		expect(tool?.kind === 'tool' && tool.tool.status).toBe('succeeded');
	});

	it('keeps text arriving after a tool call in a separate segment', async () => {
		const reply = await sendWith(streamedEvents);
		expect(reply.parts.at(-1)).toEqual({ kind: 'text', text: 'Found two.' });
	});

	it('records the user prompt as a single text part', async () => {
		await sendWith(streamedEvents);
		expect(chat.entries.at(0)?.parts).toEqual([{ kind: 'text', text: 'look this up' }]);
	});
});
