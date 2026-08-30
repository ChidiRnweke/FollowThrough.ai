import { describe, expect, it } from 'vitest';
import { AgentReplayVirtualizer } from './replay-virtualizer';
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
		const result = await new AgentReplayVirtualizer(files).virtualize(
			testActor(),
			testConversationId(),
			stringResultItem('search', 'call-1', 'large result '.repeat(5000))
		);

		expect(result).toMatchObject({
			output: expect.stringMatching(
				/^\[content stored at \/conversations\/.*\/tool-results\/call-1\/item.output-/
			)
		});
	});

	it('keeps virtualized function arguments valid JSON', async () => {
		const result = await new AgentReplayVirtualizer(new InMemoryAgentFiles()).virtualize(
			testActor(),
			testConversationId(),
			callItem('save_note', 'call-2', JSON.stringify({ markdown: 'long note '.repeat(5000) }))
		);

		expect(() => JSON.parse(result.type === 'function_call' ? result.arguments : '')).not.toThrow();
	});

	it('persists the exact bytes behind the pointer', async () => {
		const files = new InMemoryAgentFiles();
		const content = 'large result '.repeat(5000);
		await new AgentReplayVirtualizer(files).virtualize(
			testActor(),
			testConversationId(),
			stringResultItem('search', 'call-3', content)
		);

		expect((await files.list(testActor()))[0]?.content).toBe(content);
	});

	it('preserves diagram rows for the canvas recovery reader', async () => {
		const item = stringResultItem('create_diagram', 'call-4', 'diagram source '.repeat(5000));
		const result = await new AgentReplayVirtualizer(new InMemoryAgentFiles()).virtualize(
			testActor(),
			testConversationId(),
			item
		);

		expect(result).toBe(item);
	});

	it('sinks long conversation messages into the history tree', async () => {
		const result = await new AgentReplayVirtualizer(new InMemoryAgentFiles()).virtualize(
			testActor(),
			testConversationId(),
			userItemWithImage('long message '.repeat(5000), 'https://example.test/a.png')
		);

		expect(JSON.stringify(result)).toContain('/history/');
	});

	it('leaves the model reasoning alone', async () => {
		const item = reasoningItem('thinking '.repeat(5000));
		const result = await new AgentReplayVirtualizer(new InMemoryAgentFiles()).virtualize(
			testActor(),
			testConversationId(),
			item
		);

		expect(result).toBe(item);
	});

	it('leaves an item it does not recognise exactly as stored', async () => {
		const item = unrecognisedItem('compaction');
		const result = await new AgentReplayVirtualizer(new InMemoryAgentFiles()).virtualize(
			testActor(),
			testConversationId(),
			item
		);

		expect(result).toBe(item);
	});
});
