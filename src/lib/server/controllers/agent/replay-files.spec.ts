import type { PersistedSessionItem } from '$lib/models/agent';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { describe, expect, it } from 'vitest';
import {
	createConversationSession,
	createReplayVirtualizer
} from '$lib/server/factories/agent/conversation-factory';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import {
	callItem,
	reasoningItem,
	stringResultItem,
	unrecognisedItem,
	userItemWithImage
} from '$lib/testing/agent/session-items';
import { testActor, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';

describe('AgentReplayVirtualizer', () => {
	it('sinks a large tool result and leaves a readable pointer', async () => {
		const files = new InMemoryAgentFiles();
		const content = 'large result '.repeat(5000);
		const result = await snapshotItem(files, stringResultItem('search', 'call-1', content));

		expect({
			pointer: result.type === 'function_call_result' && result.output,
			stored: (await files.list(testActor()))[0]?.content
		}).toEqual({
			pointer: expect.stringMatching(
				/^\[content stored at \/conversations\/.*\/tool-results\/call-1\/item.output-/
			),
			stored: content
		});
	});

	it('keeps virtualized function arguments valid JSON', async () => {
		const result = await snapshotItem(
			new InMemoryAgentFiles(),
			callItem('save_note', 'call-2', JSON.stringify({ markdown: 'long note '.repeat(5000) }))
		);

		expect(() => JSON.parse(result.type === 'function_call' ? result.arguments : '')).not.toThrow();
	});

	it('preserves diagram rows for the canvas recovery reader', async () => {
		const item = stringResultItem('create_diagram', 'call-4', 'diagram source '.repeat(5000));
		const result = await snapshotItem(new InMemoryAgentFiles(), item);

		expect(result).toEqual(item);
	});

	it('sinks long conversation messages into the history tree', async () => {
		const result = await snapshotItem(
			new InMemoryAgentFiles(),
			userItemWithImage('long message '.repeat(5000), 'https://example.test/a.png')
		);

		expect(JSON.stringify(result)).toContain('/history/');
	});

	it('leaves the model reasoning alone', async () => {
		const item = reasoningItem('thinking '.repeat(5000));
		const result = await snapshotItem(new InMemoryAgentFiles(), item);

		expect(result).toEqual(item);
	});

	it('leaves an item it does not recognise exactly as stored', async () => {
		const item = unrecognisedItem('compaction');
		const result = await snapshotItem(new InMemoryAgentFiles(), item);

		expect(result).toEqual(item);
	});
});

const tokens = testTokenizer;

async function snapshotItem(
	files: InMemoryAgentFiles,
	item: PersistedSessionItem
): Promise<PersistedSessionItem> {
	const repository = new InMemoryAgentSessionRepository();
	await repository.append(testActor(), testConversationId(), [item]);
	const session = createConversationSession(
		repository,
		testActor(),
		testConversationId(),
		createReplayVirtualizer(files, tokens)
	);
	const result = (await session.snapshot())[0];
	if (!result) throw new Error('Snapshot item missing');
	return result;
}
