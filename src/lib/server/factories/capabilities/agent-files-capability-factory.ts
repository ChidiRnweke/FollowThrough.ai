import { AgentFileContentMeter } from '$lib/server/adapters/agent-files/content-measurement';
import { AgentResourcePaths } from '$lib/server/repositories/agent-files/agent-files';
import type {
	AgentResourcePathReading,
	AgentFileProjectReader,
	AgentFileNoteReader,
	AgentFileAttachmentReader,
	AgentFileDiagramReader
} from '$lib/models/agent-files';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import type { TokenCounter } from '$lib/models/tokenization';
import type { Database } from '$lib/server/db';
import { AgentFileRecords } from '$lib/server/repositories/agent-files/postgres/agent-files';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type {
	AgentFilePaths,
	AgentFileMaterialization,
	AgentFileCommandRules
} from '$lib/models/agent-files';
import type { NoteMarkdownWriter } from '$lib/models/note-markdown';
import { AgentFilePathsService } from '$lib/server/services/agent-files/paths';
import { AgentFileMetadataService } from '$lib/server/services/agent-files/metadata';
import { AgentFileCommandRulesService } from '$lib/server/services/agent-files/commands';

export interface AgentFilesCapabilityInput {
	readonly tokens: TokenCounter;
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
}

export interface AgentFilesCapability {
	readonly repository: AgentFileRepository;
	readonly resourcePaths: AgentResourcePathReading;
	readonly paths: AgentFilePaths;
	readonly metadata: AgentFileMaterialization;
	readonly commands: AgentFileCommandRules;
	readonly projects: AgentFileProjectReader;
	readonly notes: AgentFileNoteReader;
	readonly attachments: AgentFileAttachmentReader;
	readonly diagrams: AgentFileDiagramReader;
	readonly noteMarkdown: NoteMarkdownWriter;
}

export const createAgentFilesCapability = (
	input: AgentFilesCapabilityInput
): AgentFilesCapability => {
	const measurement = new AgentFileContentMeter(input.tokens);
	const metadata = new AgentFileMetadataService(measurement);
	return {
		repository: new AgentFileRecords(input.db, measurement),
		resourcePaths: new AgentResourcePaths(),
		paths: new AgentFilePathsService(),
		metadata,
		commands: new AgentFileCommandRulesService(),
		projects: input.projects,
		notes: input.notes,
		attachments: new AttachmentRecords(input.db),
		diagrams: new DiagramRecords(input.db),
		noteMarkdown: new NodeNoteMarkdown()
	};
};
