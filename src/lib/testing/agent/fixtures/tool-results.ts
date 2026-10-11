import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import { createAgentToolResults } from '$lib/server/factories/agent/tool-result-factory';
import { AgentFileReferenceService } from '$lib/server/services/agent-files/virtual-files';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
export const agentToolResultsFixture = () => ({
	...createAgentToolResults(),
	markdown: new NoteMarkdownCodec(),
	agentFiles: new AgentFileReferenceService(testTokenizer)
});
