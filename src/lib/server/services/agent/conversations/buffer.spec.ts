import { describe, expect, it } from 'vitest';
import type { AgentInputItem } from '@openai/agents';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import { ConversationBuffer } from './buffer';
import { AgentReplayVirtualizer } from './replay-virtualizer';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';

const conversationId = 'conversation-1' as ConversationId;
const actor: ActorContext = { userId: 'user-1' as ActorContext['userId'] };
const emptyRepository = { list: async () => [] } as unknown as AgentSessionRepository;

const bufferWith = async (items: AgentInputItem[]): Promise<ConversationBuffer> => {
	const buffer = new ConversationBuffer(
		emptyRepository,
		actor,
		conversationId,
		new AgentReplayVirtualizer(new InMemoryAgentFiles())
	);
	await buffer.addItems(items);
	return buffer;
};

const pngDataUrl = `data:image/png;base64,${'A'.repeat(2048)}`;

describe('ConversationBuffer', () => {
	it('is available as a domain service', () => {
		expect(ConversationBuffer).toBeTypeOf('function');
	});

	it('drops an inline image from the persisted snapshot', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [{ type: 'input_image', image: pngDataUrl }]
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.snapshot())).not.toContain(';base64,');
	});

	it('keeps the text that accompanied a dropped image', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [
					{ type: 'input_text', text: 'What does this diagram show?' },
					{ type: 'input_image', image: pngDataUrl }
				]
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.snapshot())).toContain('What does this diagram show?');
	});

	// The placeholder has to be a part the provider can accept. Left in the image's
	// own field it read as a URL, and the provider refused the whole request —
	// "Expected a valid URL, but got a value with an invalid format" — so one image
	// made its conversation impossible to continue.
	it('replaces a dropped image with a text part rather than a broken image part', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [{ type: 'input_image', image: pngDataUrl }]
			} as unknown as AgentInputItem
		]);
		const [item] = await buffer.snapshot();
		expect((item as { content: { type: string }[] }).content[0]?.type).toBe('input_text');
	});

	it('leaves no image part behind for the provider to reject', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [{ type: 'input_image', image: pngDataUrl }]
			} as unknown as AgentInputItem
		]);
		const [item] = await buffer.snapshot();
		expect(JSON.stringify(item)).not.toContain('input_image');
	});

	// Conversations stored before the fix still hold the unsendable item, and a
	// history the model can never be shown again cannot be continued.
	it('repairs a conversation already holding a broken image part', async () => {
		const repository = {
			list: async () => [
				{
					item: {
						role: 'user',
						content: [{ type: 'input_image', image: '<image omitted from history>' }]
					}
				}
			]
		} as unknown as AgentSessionRepository;
		const buffer = new ConversationBuffer(
			repository,
			actor,
			conversationId,
			new AgentReplayVirtualizer(new InMemoryAgentFiles())
		);
		expect(JSON.stringify(await buffer.getItems())).not.toContain('input_image');
	});

	it('keeps a remote image the provider can still fetch', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [{ type: 'input_image', image: 'https://example.test/diagram.png' }]
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.snapshot())).toContain('https://example.test/diagram.png');
	});

	// An mxfile is 5–8 KB and rides in both the call and its result, so a
	// conversation with a few revisions replayed tens of kilobytes of markup every
	// turn for a document the agent almost never needed to re-read.
	it('elides diagram source from what the model is shown', async () => {
		const buffer = await bufferWith([
			{
				name: 'create_diagram',
				type: 'function_call',
				arguments: JSON.stringify({ kind: 'drawio', source: '<mxfile>huge</mxfile>' })
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.getItems())).not.toContain('<mxfile>huge</mxfile>');
	});

	it('elides the source from the result as well as the call', async () => {
		const buffer = await bufferWith([
			{
				callId: 'diagram-call',
				name: 'create_diagram',
				status: 'completed',
				type: 'function_call_result',
				output: {
					type: 'text',
					text: JSON.stringify({ kind: 'drawio', source: '<mxfile>huge</mxfile>' })
				}
			} satisfies AgentInputItem
		]);
		expect(JSON.stringify(await buffer.getItems())).not.toContain('<mxfile>huge</mxfile>');
	});

	// The source of a call that *failed* stays, because nothing else can hand it
	// back: `read_canvas_diagram` only answers with the last version that worked.
	// Eliding it left the agent re-sending the same rejected XML twice.
	it('keeps the source of a presentation that failed', async () => {
		const buffer = await bufferWith([
			{
				callId: 'diagram-call',
				name: 'create_diagram',
				type: 'function_call',
				arguments: JSON.stringify({ source: '<mxfile>rejected</mxfile>' })
			} as unknown as AgentInputItem,
			{
				callId: 'diagram-call',
				name: 'create_diagram',
				status: 'completed',
				type: 'function_call_result',
				output: { type: 'text', text: JSON.stringify({ failure: 'draw.io XML is malformed' }) }
			} satisfies AgentInputItem
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain('<mxfile>rejected</mxfile>');
	});

	it('points the agent at the tool that reads it back', async () => {
		const buffer = await bufferWith([
			{
				name: 'create_diagram',
				type: 'function_call',
				arguments: JSON.stringify({ source: '<mxfile>huge</mxfile>' })
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain('read_canvas_diagram');
	});

	// Elided on the way out, never on the way in: the stored document is what
	// `read_canvas_diagram` hands back.
	it('keeps the whole document in what is persisted', async () => {
		const buffer = await bufferWith([
			{
				name: 'create_diagram',
				type: 'function_call',
				arguments: JSON.stringify({ source: '<mxfile>huge</mxfile>' })
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.snapshot())).toContain('<mxfile>huge</mxfile>');
	});

	it('leaves another tool’s arguments alone', async () => {
		const buffer = await bufferWith([
			{
				name: 'save_note',
				type: 'function_call',
				arguments: JSON.stringify({ source: 'keep me' })
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain('keep me');
	});

	it('leaves an item without an image untouched', async () => {
		const item = { role: 'assistant', content: 'Understood.' } as unknown as AgentInputItem;
		const buffer = await bufferWith([item]);
		expect(await buffer.snapshot()).toEqual([{ role: 'assistant', content: 'Understood.' }]);
	});

	it('still returns the image to the run that is in flight', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [{ type: 'input_image', image: pngDataUrl }]
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain(';base64,');
	});
});
