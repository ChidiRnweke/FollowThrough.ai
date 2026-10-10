import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import type { TokenCounter } from '$lib/models/tokenization';
import type { Database } from '$lib/server/db';
import { AgentFileRecords } from '$lib/server/repositories/agent-files/postgres/agent-files';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import {
	AgentVirtualFiles,
	type AgentFileReferences,
	type AgentFileReader
} from '$lib/server/services/agent-files/virtual-files';

export interface AgentFilesCapabilityInput {
	readonly tokens: TokenCounter;
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
}

export interface AgentFilesCapability {
	readonly reader: AgentFileReader;
	readonly references: AgentFileReferences;
	readonly repository: AgentFileRepository;
}

export const createAgentFilesCapability = (
	input: AgentFilesCapabilityInput
): AgentFilesCapability => {
	const tokens = input.tokens;
	const repository = new AgentFileRecords(input.db, tokens);
	const files = new AgentVirtualFiles({
		tokens,
		projects: input.projects,
		notes: input.notes,
		attachments: new AttachmentRecords(input.db),
		diagrams: new DiagramRecords(input.db),
		stored: repository,
		noteMarkdown: new NodeNoteMarkdown()
	});
	return { repository, reader: files, references: files };
};
