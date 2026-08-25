import { describe, expect, it } from 'vitest';
import { AgentReplayVirtualizer } from './replay-virtualizer';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { testActor, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';

describe('AgentReplayVirtualizer', () => {
	it('sinks a large tool result and leaves a readable pointer', async () => {
		const files = new InMemoryAgentFiles();
		const result = await new AgentReplayVirtualizer(files).virtualize(
			testActor(),
			testConversationId(),
			{
				type: 'function_call_result',
				name: 'search',
				callId: 'call-1',
				output: 'large result '.repeat(5000)
			}
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
			{
				type: 'function_call',
				name: 'save_note',
				callId: 'call-2',
				arguments: JSON.stringify({ markdown: 'long note '.repeat(5000) })
			}
		);

		expect(() => JSON.parse(result.arguments as string)).not.toThrow();
	});

	it('persists the exact bytes behind the pointer', async () => {
		const files = new InMemoryAgentFiles();
		const content = 'large result '.repeat(5000);
		await new AgentReplayVirtualizer(files).virtualize(testActor(), testConversationId(), {
			type: 'function_call_result',
			name: 'search',
			callId: 'call-3',
			output: content
		});

		expect((await files.list(testActor()))[0]?.content).toBe(content);
	});

	it('preserves diagram rows for the canvas recovery reader', async () => {
		const item = {
			type: 'function_call_result',
			name: 'create_diagram',
			callId: 'call-4',
			output: 'diagram source '.repeat(5000)
		};
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
			{ role: 'user', content: [{ type: 'input_text', text: 'long message '.repeat(5000) }] }
		);

		expect(JSON.stringify(result)).toContain('/history/');
	});
});
