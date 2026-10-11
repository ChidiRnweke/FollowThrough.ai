import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import { AgentFileReferenceService } from '$lib/server/services/agent-files/virtual-files';
import { ProjectRules } from '$lib/services/projects/rules';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
export const agentToolResultsFixture = () => ({
	projectChoice: new ProjectRules(),
	markdown: new NoteMarkdownCodec(),
	agentFiles: new AgentFileReferenceService(testTokenizer)
});
