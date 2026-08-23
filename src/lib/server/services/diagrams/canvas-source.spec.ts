import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import { PresentedCanvasSource, type CanvasSourceItems } from './canvas-source';

const actor = { userId: 'user-1' as ActorContext['userId'] };
const conversation = 'conversation-1' as ConversationId;

const result = (source: string, title = 'Architecture') => ({
	item: {
		name: 'present_diagram',
		type: 'function_call_result',
		output: { text: JSON.stringify({ source, title }) }
	}
});

const itemsOf = (...rows: { item: Record<string, unknown> }[]): CanvasSourceItems => ({
	list: async () => rows
});

describe('Reading the diagram on the canvas', () => {
	it('returns the source of the diagram the agent last presented', async () => {
		const reader = new PresentedCanvasSource(itemsOf(result('<mxfile>one</mxfile>')));
		expect((await reader.latest(actor, conversation))?.source).toBe('<mxfile>one</mxfile>');
	});

	it('returns the most recent one when a diagram was revised', async () => {
		const reader = new PresentedCanvasSource(
			itemsOf(result('<mxfile>one</mxfile>'), result('<mxfile>two</mxfile>'))
		);
		expect((await reader.latest(actor, conversation))?.source).toBe('<mxfile>two</mxfile>');
	});

	it('carries the title, so the canvas can name what it is holding', async () => {
		const reader = new PresentedCanvasSource(itemsOf(result('<mxfile>one</mxfile>', 'Ingest')));
		expect((await reader.latest(actor, conversation))?.title).toBe('Ingest');
	});

	it('says nothing when the conversation has drawn nothing', async () => {
		const reader = new PresentedCanvasSource(itemsOf());
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});

	// The call carries the proposal; the result carries what was validated.
	it('ignores the call and reads the result', async () => {
		const call = {
			item: {
				name: 'present_diagram',
				type: 'function_call',
				arguments: JSON.stringify({ source: '<mxfile>proposed</mxfile>' })
			}
		};
		const reader = new PresentedCanvasSource(itemsOf(call));
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});

	it('skips a presentation that failed validation', async () => {
		const failed = {
			item: {
				name: 'present_diagram',
				type: 'function_call_result',
				output: { text: JSON.stringify({ failure: 'draw.io XML is malformed' }) }
			}
		};
		const reader = new PresentedCanvasSource(itemsOf(result('<mxfile>good</mxfile>'), failed));
		expect((await reader.latest(actor, conversation))?.source).toBe('<mxfile>good</mxfile>');
	});

	it('ignores other tools entirely', async () => {
		const other = {
			item: { name: 'get_note', type: 'function_call_result', output: { text: '{"source":"x"}' } }
		};
		const reader = new PresentedCanvasSource(itemsOf(other));
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});
});
