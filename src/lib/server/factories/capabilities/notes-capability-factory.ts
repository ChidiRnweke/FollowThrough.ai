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
	readonly repository: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly catalog: NoteCatalog;
	readonly provenance: ProvenanceRecorder;
	readonly provenanceRepository: ProvenanceRecords;
}

export const createNotesCapability = (input: NotesCapabilityInput): NotesCapability => {
	const repository = new NoteRecords(input.db);
	const anchors = new SourceAnchorRecords(input.db);
	const provenanceRepository = new ProvenanceRecords(input.db);
	return {
		repository,
		anchors,
		catalog: new NoteCatalog(repository, anchors, input.projects),
		provenance: new NoteProvenance(provenanceRepository, anchors),
		provenanceRepository
	};
};
