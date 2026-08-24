import type { Database } from '$lib/server/db';
import { AgentFileRecords } from '$lib/server/repositories/agent-files/postgres/agent-files';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import { AgentVirtualFiles } from '$lib/server/services/agent-files/virtual-files';
import { noteMarkdownFromContent } from '$lib/server/services/notes/markdown';

export interface AgentFilesCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
}

export interface AgentFilesCapability {
	readonly reader: AgentVirtualFiles;
	readonly repository: AgentFileRecords;
}

export const createAgentFilesCapability = (
	input: AgentFilesCapabilityInput
): AgentFilesCapability => {
	const repository = new AgentFileRecords(input.db);
	return {
		repository,
		reader: new AgentVirtualFiles({
			projects: input.projects,
			notes: input.notes,
			attachments: new AttachmentRecords(input.db),
			diagrams: new DiagramRecords(input.db),
			stored: repository,
			noteMarkdown: noteMarkdownFromContent
		})
	};
};
