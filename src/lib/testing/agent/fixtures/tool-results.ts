import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import { AgentFileReferenceService } from '$lib/server/services/agent-files/virtual-files';
import { ProjectChoiceService } from '$lib/services/projects/choice';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
export const agentToolResultsFixture = () => ({
	projectChoice: new ProjectChoiceService(),
	markdown: new NoteMarkdownCodec(),
	agentFiles: new AgentFileReferenceService(testTokenizer)
});
