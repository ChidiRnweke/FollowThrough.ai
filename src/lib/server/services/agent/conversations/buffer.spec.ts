import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId, PersistedSessionItem } from '$lib/models/agent';
import { ConversationBuffer, toAgentInputItem } from './buffer';
import { AgentReplayVirtualizer } from './replay-virtualizer';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import {
	assistantItem,
	callItem,
	resultItem,
	unrecognisedItem,
	userItemWithImage
} from '$lib/testing/agent/session-items';

const conversationId = 'conversation-1' as ConversationId;
const actor: ActorContext = { userId: 'user-1' as ActorContext['userId'] };

const bufferOver = (stored: readonly PersistedSessionItem[]): ConversationBuffer => {
	const repository = new InMemoryAgentSessionRepository();
	repository.items = stored.map((item, position) => ({
		id: `item-${position}` as (typeof repository.items)[number]['id'],
		conversationId,
		position,
		item,
		createdAt: new Date().toISOString() as (typeof repository.items)[number]['createdAt']
	}));
	return new ConversationBuffer(
		repository,
		actor,
		conversationId,
		new AgentReplayVirtualizer(new InMemoryAgentFiles())
	);
};

const bufferWith = async (items: readonly PersistedSessionItem[]): Promise<ConversationBuffer> => {
	const buffer = bufferOver([]);
	await buffer.addItems(items.map(toAgentInputItem));
	return buffer;
};

const pngDataUrl = `data:image/png;base64,${'A'.repeat(2048)}`;
const imageItem = (image: string) => userItemWithImage('What does this diagram show?', image);
const diagramSource = JSON.stringify({ kind: 'drawio', source: '<mxfile>huge</mxfile>' });

describe('ConversationBuffer', () => {
	it('is available as a domain service', () => {
		expect(ConversationBuffer).toBeTypeOf('function');
	});

	it('drops an inline image from the persisted snapshot', async () => {
		const buffer = await bufferWith([imageItem(pngDataUrl)]);
		expect(JSON.stringify(await buffer.snapshot())).not.toContain(';base64,');
	});

	it('keeps the text that accompanied a dropped image', async () => {
		const buffer = await bufferWith([imageItem(pngDataUrl)]);
		expect(JSON.stringify(await buffer.snapshot())).toContain('What does this diagram show?');
	});

	// The placeholder has to be a part the provider can accept. Left in the image's
	// own field it read as a URL, and the provider refused the whole request —
	// "Expected a valid URL, but got a value with an invalid format" — so one image
	// made its conversation impossible to continue.
	it('replaces a dropped image with a text part rather than a broken image part', async () => {
		const buffer = await bufferWith([imageItem(pngDataUrl)]);
		const [item] = await buffer.snapshot();
		const parts = item?.type === 'user_message' ? item.content : '';
		expect(typeof parts === 'string' ? undefined : parts[1]?.type).toBe('input_text');
	});

	it('leaves no image part behind for the provider to reject', async () => {
		const buffer = await bufferWith([imageItem(pngDataUrl)]);
		expect(JSON.stringify(await buffer.snapshot())).not.toContain('input_image');
	});

	// Conversations stored before the fix still hold the unsendable item, and a
	// history the model can never be shown again cannot be continued.
	it('repairs a conversation already holding a broken image part', async () => {
		const buffer = bufferOver([imageItem('<image omitted from history>')]);
		expect(JSON.stringify(await buffer.getItems())).not.toContain('input_image');
	});

	it('keeps a remote image the provider can still fetch', async () => {
		const buffer = await bufferWith([imageItem('https://example.test/diagram.png')]);
		expect(JSON.stringify(await buffer.snapshot())).toContain('https://example.test/diagram.png');
	});

	// An mxfile is 5–8 KB and rides in both the call and its result, so a
	// conversation with a few revisions replayed tens of kilobytes of markup every
	// turn for a document the agent almost never needed to re-read.
	it('elides diagram source from what the model is shown', async () => {
		const buffer = await bufferWith([callItem('create_diagram', 'diagram-call', diagramSource)]);
		expect(JSON.stringify(await buffer.getItems())).not.toContain('<mxfile>huge</mxfile>');
	});

	it('elides the source from the result as well as the call', async () => {
		const buffer = await bufferWith([resultItem('create_diagram', 'diagram-call', diagramSource)]);
		expect(JSON.stringify(await buffer.getItems())).not.toContain('<mxfile>huge</mxfile>');
	});

	// The source of a call that *failed* stays, because nothing else can hand it
	// back: `read_canvas_diagram` only answers with the last version that worked.
	// Eliding it left the agent re-sending the same rejected XML twice.
	it('keeps the source of a presentation that failed', async () => {
		const buffer = await bufferWith([
			callItem(
				'create_diagram',
				'diagram-call',
				JSON.stringify({ source: '<mxfile>rejected</mxfile>' })
			),
			resultItem(
				'create_diagram',
				'diagram-call',
				JSON.stringify({ failure: 'draw.io XML is malformed' })
			)
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain('<mxfile>rejected</mxfile>');
	});

	it('points the agent at the tool that reads it back', async () => {
		const buffer = await bufferWith([callItem('create_diagram', 'diagram-call', diagramSource)]);
		expect(JSON.stringify(await buffer.getItems())).toContain('read_canvas_diagram');
	});

	// Elided on the way out, never on the way in: the stored document is what
	// `read_canvas_diagram` hands back.
	it('keeps the whole document in what is persisted', async () => {
		const buffer = await bufferWith([callItem('create_diagram', 'diagram-call', diagramSource)]);
		expect(JSON.stringify(await buffer.snapshot())).toContain('<mxfile>huge</mxfile>');
	});

	it('leaves another tool’s arguments alone', async () => {
		const buffer = await bufferWith([
			callItem('save_note', 'note-call', JSON.stringify({ source: 'keep me' }))
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain('keep me');
	});

	it('leaves an item without an image untouched', async () => {
		const item = assistantItem('Understood.');
		const buffer = await bufferWith([item]);
		expect(await buffer.snapshot()).toEqual([item]);
	});

	it('still returns the image to the run that is in flight', async () => {
		const buffer = await bufferWith([imageItem(pngDataUrl)]);
		expect(JSON.stringify(await buffer.getItems())).toContain(';base64,');
	});

	// A row from a newer provider must survive a load and a save. Restructuring a
	// shape this code did not understand is how a conversation gets corrupted.
	it('carries an item it does not recognise through unchanged', async () => {
		const item = unrecognisedItem('compaction');
		const buffer = bufferOver([item]);
		expect(await buffer.snapshot()).toEqual([item]);
	});
});
