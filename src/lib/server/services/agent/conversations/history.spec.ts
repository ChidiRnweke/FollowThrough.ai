import { describe, expect, it } from 'vitest';
import { ConversationHistoryService } from './history';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import {
	callItem,
	resultItem,
	stringResultItem,
	unrecognisedItem,
	userItemWithImage
} from '$lib/testing/agent/session-items';
import type { ConversationId, PersistedSessionItem } from '$lib/models/agent';
import { testActor, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';

const pngDataUrl = `data:image/png;base64,${'A'.repeat(2048)}`;
const imageItem = (image: string) => userItemWithImage('What does this diagram show?', image);
const diagramSource = JSON.stringify({ kind: 'drawio', source: '<mxfile>huge</mxfile>' });

const historyOver = (
	stored: readonly PersistedSessionItem[] = [],
	files = new InMemoryAgentFiles(testActor())
) => {
	const repository = new InMemoryAgentSessionRepository();
	repository.items = stored.map((item, position) => ({
		id: `item-${position}` as (typeof repository.items)[number]['id'],
		conversationId: testConversationId() as ConversationId,
		position,
		item,
		createdAt: new Date().toISOString() as (typeof repository.items)[number]['createdAt']
	}));
	return {
		history: new ConversationHistoryService(repository, files, testTokenizer),
		files
	};
};
const snapshot = (items: readonly PersistedSessionItem[]) =>
	historyOver().history.snapshot(testConversationId(), items);

describe('Stored conversation history', () => {
	it('stores the prompt of an inline image but not the image', async () => {
		const persisted = JSON.stringify(await snapshot([imageItem(pngDataUrl)]));
		expect({
			prompt: persisted.includes('What does this diagram show?'),
			placeholder: persisted.includes('input_text'),
			image: persisted.includes('input_image'),
			base64: persisted.includes(';base64,')
		}).toEqual({ prompt: true, placeholder: true, image: false, base64: false });
	});

	// Conversations stored before the fix still hold the unsendable item, and a
	// history the model can never be shown again cannot be continued.
	it('repairs a stored conversation already holding a broken image part', async () => {
		const { history } = historyOver([imageItem('<image omitted from history>')]);
		expect(JSON.stringify(await history.load(testConversationId()))).not.toContain('input_image');
	});

	it('keeps a remote image the provider can still fetch', async () => {
		expect(
			JSON.stringify(await snapshot([imageItem('https://example.test/diagram.png')]))
		).toContain('https://example.test/diagram.png');
	});

	it('keeps diagram source in storage for readback', async () => {
		expect(
			JSON.stringify(
				await snapshot([
					callItem('create_diagram', 'diagram-call', diagramSource),
					resultItem('create_diagram', 'diagram-call', diagramSource)
				])
			)
		).toContain('<mxfile>huge</mxfile>');
	});

	// A row from a newer provider must survive a load and a save. Restructuring a
	// shape this code did not understand is how a conversation gets corrupted.
	it('carries an item it does not recognise through unchanged', async () => {
		const item = unrecognisedItem('compaction');
		expect(await snapshot([item])).toEqual([item]);
	});

	it('leaves diagram arguments intact for canvas recovery', async () => {
		const item = callItem(
			'create_diagram',
			'diagram-1',
			JSON.stringify({ source: 'diagram '.repeat(5000) })
		);
		expect(await snapshot([item])).toEqual([item]);
	});

	it('reuses the content-addressed file for repeated replay of the same output', async () => {
		const { history, files } = historyOver();
		const item = stringResultItem('search', 'search-1', 'result '.repeat(5000));
		const [first] = await history.snapshot(testConversationId(), [item]);
		const [second] = await history.snapshot(testConversationId(), [item]);
		expect({
			same:
				first?.type === 'function_call_result' &&
				second?.type === 'function_call_result' &&
				first.output === second.output,
			files: (await files.list()).length
		}).toEqual({ same: true, files: 1 });
	});
});
