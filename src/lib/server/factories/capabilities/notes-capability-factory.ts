import { NoteTextSearchService, type NoteTextSearch } from '$lib/services/notes/text-search';
import { NoteReferenceService, type NoteReferences } from '$lib/services/notes/references';
import {
	NoteSectionNumberingService,
	type NoteSectionNumbering
} from '$lib/services/notes/section-numbering';
import {
	NoteLifecycleService as SharedNoteLifecycleService,
	type NoteCreationRules,
	type NoteTrashRules,
	type NotePublicationRules
} from '$lib/services/notes/lifecycle';
import {
	NoteEditingService as SharedNoteEditingService,
	type NoteEditingRules
} from '$lib/services/notes/editing';
import { NotePresentationService, type NotePresentation } from '$lib/services/notes/presentation';
import {
	noteContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/server/services/notes/markdown';
import type { NoteMarkdown } from '$lib/server/services/notes/contracts';
import {
	SelectionOrigins,
	type SelectionOriginService
} from '$lib/server/services/notes/selection-origin';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type {
	SourceAnchorRepository,
	ProvenanceRepository
} from '$lib/server/repositories/provenance';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import {
	NoteReadingService,
	NoteEditingService,
	NoteLifecycleService,
	NoteRevisionReadingService,
	NoteRevisionWritingService,
	NotePublicationService,
	NoteAnchorRepairService,
	NoteCreationService,
	type NoteCreator,
	type NoteReader,
	type NoteTreeReader,
	type NoteTextSearcher,
	type NoteEditor,
	type NoteSectionNumberingEditor,
	type NoteTrashOperations,
	type NoteTrashReader,
	type NoteDeletion,
	type NotePublisher,
	type NoteRevisionRecorder,
	type NoteRevisionReader,
	type NoteAttachmentRestorer,
	type SourceAnchorRepairer
} from '$lib/server/services/notes/catalog';
import { NoteProvenance, type ProvenanceRecorder } from '$lib/server/services/notes/provenance';

export interface NotesCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
}

export interface NotesCapability {
	readonly references: NoteReferences;
	readonly textSearch: NoteTextSearch;
	readonly sections: NoteSectionNumbering;
	readonly creationRules: NoteCreationRules;
	readonly trashRules: NoteTrashRules;
	readonly publicationRules: NotePublicationRules;
	readonly editingRules: NoteEditingRules;
	readonly presentation: NotePresentation;
	readonly markdown: NoteMarkdown;
	readonly repository: NoteRepository;
	readonly anchors: SourceAnchorRepository;
	readonly services: NoteServices;
	readonly selectionOrigins: SelectionOriginService;
	readonly provenance: ProvenanceRecorder;
	readonly provenanceRepository: ProvenanceRepository;
}

export const createNotesCapability = (input: NotesCapabilityInput): NotesCapability => {
	const repository = new NoteRecords(input.db);
	const anchors = new SourceAnchorRecords(input.db);
	const provenanceRepository = new ProvenanceRecords(input.db);
	const lifecycleRules = new SharedNoteLifecycleService();
	const services = createNoteServices(repository, anchors, input.projects);
	return {
		presentation: new NotePresentationService(),
		references: new NoteReferenceService(),
		textSearch: new NoteTextSearchService(),
		sections: new NoteSectionNumberingService(),
		creationRules: lifecycleRules,
		trashRules: lifecycleRules,
		publicationRules: lifecycleRules,
		editingRules: new SharedNoteEditingService(),
		markdown: { read: noteContentFromMarkdown, write: noteMarkdownFromContent },
		repository,
		anchors,
		services,
		selectionOrigins: new SelectionOrigins(repository, anchors, provenanceRepository),
		provenance: new NoteProvenance(provenanceRepository, anchors),
		provenanceRepository
	};
};

export interface NoteServices {
	readonly creator: NoteCreator;
	readonly reader: NoteReader;
	readonly treeReader: NoteTreeReader;
	readonly textSearcher: NoteTextSearcher;
	readonly editor: NoteEditor;
	readonly sectionNumbering: NoteSectionNumberingEditor;
	readonly trash: NoteTrashOperations;
	readonly trashReader: NoteTrashReader;
	readonly deletion: NoteDeletion;
	readonly publisher: NotePublisher;
	readonly revisionRecorder: NoteRevisionRecorder;
	readonly revisionReader: NoteRevisionReader;
	readonly attachmentRestorer: NoteAttachmentRestorer;
	readonly anchorRepairer: SourceAnchorRepairer;
}
export const createNoteServices = (
	notes: NoteRepository,
	anchors: SourceAnchorRepository,
	projects: ProjectRepository
): NoteServices => {
	const reading = new NoteReadingService(notes, projects);
	const editing = new NoteEditingService(notes);
	const lifecycle = new NoteLifecycleService(notes, projects);
	const revisionWriting = new NoteRevisionWritingService(notes);
	return {
		reader: reading,
		treeReader: reading,
		textSearcher: reading,
		trashReader: reading,
		editor: editing,
		sectionNumbering: editing,
		trash: lifecycle,
		deletion: lifecycle,
		creator: new NoteCreationService(notes, projects),
		publisher: new NotePublicationService(notes),
		revisionReader: new NoteRevisionReadingService(notes),
		revisionRecorder: revisionWriting,
		attachmentRestorer: revisionWriting,
		anchorRepairer: new NoteAnchorRepairService(notes, anchors)
	};
};
