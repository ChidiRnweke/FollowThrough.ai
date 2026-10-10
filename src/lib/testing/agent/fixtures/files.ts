import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { AgentFiles } from '$lib/server/controllers/agent-files/controller';
import { AgentVirtualFiles } from '$lib/server/services/agent-files/virtual-files';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { InMemoryAttachmentRepository } from '$lib/testing/attachments/fakes/processing';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { agentToolResultsFixture } from './tool-results';
export const agentFilesFixture = () =>
	new AgentFiles({
		...agentToolResultsFixture(),
		reader: new AgentVirtualFiles({
			tokens: testTokenizer,
			projects: new InMemoryProjectRepository(),
			notes: new InMemoryNoteRepository(),
			attachments: new InMemoryAttachmentRepository(),
			diagrams: new InMemoryDiagramRepository(),
			stored: new InMemoryAgentFiles(),
			noteMarkdown: new NodeNoteMarkdown()
		})
	});
