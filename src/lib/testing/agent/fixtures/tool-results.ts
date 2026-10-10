import { AgentFileContentMeter } from '$lib/server/adapters/agent-files/content-measurement';
import { AgentFileMetadataService } from '$lib/server/services/agent-files/metadata';
import { AgentFilePathsService } from '$lib/server/services/agent-files/paths';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { createAgentToolResults } from '$lib/server/factories/agent/tool-result-factory';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
export const agentToolResultsFixture = () => ({
	...createAgentToolResults(),
	markdown: new NodeNoteMarkdown(),
	filePaths: new AgentFilePathsService(),
	fileMetadata: new AgentFileMetadataService(new AgentFileContentMeter(testTokenizer))
});
