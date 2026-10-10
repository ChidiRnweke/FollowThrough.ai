import { expect, it } from 'vitest';
import { AgentReplayVirtualizer } from './replay-virtualizer';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { callItem, stringResultItem } from '$lib/testing/agent/session-items';
import { testActor, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';
it('leaves diagram arguments intact for canvas recovery', () => {
	const item = callItem(
		'create_diagram',
		'diagram-1',
		JSON.stringify({ source: 'diagram '.repeat(5000) })
	);
	const rules = new AgentReplayVirtualizer(new InMemoryAgentFiles(), testTokenizer);
	expect(rules.prepare(item)).toEqual({ kind: 'unchanged', item });
});
it('reuses the content-addressed file for repeated replay of the same output', async () => {
	const files = new InMemoryAgentFiles();
	const rules = new AgentReplayVirtualizer(files, testTokenizer);
	const item = stringResultItem('search', 'search-1', 'result '.repeat(5000));
	const content = { kind: 'record' as const, item };
	const first = await rules.apply(testActor(), testConversationId(), content);
	const second = await rules.apply(testActor(), testConversationId(), content);
	expect({
		same:
			first.type === 'function_call_result' &&
			second.type === 'function_call_result' &&
			first.output === second.output,
		files: (await files.list(testActor())).length
	}).toEqual({ same: true, files: 1 });
});
