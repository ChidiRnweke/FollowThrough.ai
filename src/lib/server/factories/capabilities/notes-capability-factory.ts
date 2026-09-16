import {
	noteContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/server/services/notes/markdown';
import type { NoteMarkdown } from '$lib/server/services/notes/contracts';
import { SelectionOrigins } from '$lib/server/services/notes/selection-origin';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type { SourceAnchorRepository } from '$lib/server/repositories/provenance';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import { NoteProvenance, type ProvenanceRecorder } from '$lib/server/services/notes/provenance';

export interface NotesCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
}

export interface NotesCapability {
	readonly markdown: NoteMarkdown;
	readonly repository: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly catalog: NoteCatalog;
	readonly selectionOrigins: SelectionOrigins;
	readonly provenance: ProvenanceRecorder;
	readonly provenanceRepository: ProvenanceRecords;
}

export const createNotesCapability = (input: NotesCapabilityInput): NotesCapability => {
	const repository = new NoteRecords(input.db);
	const anchors = new SourceAnchorRecords(input.db);
	const provenanceRepository = new ProvenanceRecords(input.db);
	const catalog = new NoteCatalog(repository, anchors, input.projects);
	return {
		markdown: { read: noteContentFromMarkdown, write: noteMarkdownFromContent },
		repository,
		anchors,
		catalog,
		selectionOrigins: new SelectionOrigins(repository, anchors, provenanceRepository),
		provenance: new NoteProvenance(provenanceRepository, anchors),
		provenanceRepository
	};
};
