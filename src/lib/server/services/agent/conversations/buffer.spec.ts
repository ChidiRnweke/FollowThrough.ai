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
	it('keeps image context in the active run and a safe text-only persisted snapshot', async () => {
		const buffer = await bufferWith([imageItem(pngDataUrl)]);
		const active = JSON.stringify(await buffer.getItems());
		const persisted = JSON.stringify(await buffer.snapshot());
		expect({
			activeImage: active.includes(';base64,'),
			persistedPrompt: persisted.includes('What does this diagram show?'),
			persistedTextPlaceholder: persisted.includes('input_text'),
			persistedImage: persisted.includes('input_image'),
			persistedBase64: persisted.includes(';base64,')
		}).toEqual({
			activeImage: true,
			persistedPrompt: true,
			persistedTextPlaceholder: true,
			persistedImage: false,
			persistedBase64: false
		});
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
	it('elides diagram source from the model replay while keeping it persisted for readback', async () => {
		const buffer = await bufferWith([
			callItem('create_diagram', 'diagram-call', diagramSource),
			resultItem('create_diagram', 'diagram-call', diagramSource)
		]);
		const replay = JSON.stringify(await buffer.getItems());
		const persisted = JSON.stringify(await buffer.snapshot());
		expect({
			callElided: !replay.includes('<mxfile>huge</mxfile>'),
			readbackTool: replay.includes('read_canvas_diagram'),
			persistedSource: persisted.includes('<mxfile>huge</mxfile>')
		}).toEqual({ callElided: true, readbackTool: true, persistedSource: true });
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
				JSON.stringify({
					kind: 'failure',
					code: 'VALIDATION',
					message: 'draw.io XML is malformed',
					recovery: 'Correct the XML.',
					details: {}
				})
			)
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain('<mxfile>rejected</mxfile>');
	});

	it('leaves another tool’s arguments alone', async () => {
		const buffer = await bufferWith([
			callItem('save_note', 'note-call', JSON.stringify({ source: 'keep me' }))
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain('keep me');
	});

	// A row from a newer provider must survive a load and a save. Restructuring a
	// shape this code did not understand is how a conversation gets corrupted.
	it('carries an item it does not recognise through unchanged', async () => {
		const item = unrecognisedItem('compaction');
		const buffer = bufferOver([item]);
		expect(await buffer.snapshot()).toEqual([item]);
	});
});
