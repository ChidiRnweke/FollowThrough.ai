import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { createAgentToolResults } from '$lib/server/factories/agent/tool-result-factory';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
export const agentToolResultsFixture = () => ({
	...createAgentToolResults(),
	markdown: new NodeNoteMarkdown(),
	toolTokens: testTokenizer
});
