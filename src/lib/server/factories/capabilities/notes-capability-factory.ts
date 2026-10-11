import type { DateTime } from '$lib/models/workspace';
import type { ActorContext } from '$lib/models/identity';
import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import {
	NoteArchiveImportService,
	type NoteArchiveImportPreparation
} from '$lib/server/services/notes/import';
import {
	NotePatchPreparationService,
	type NotePatchPreparation
} from '$lib/server/services/notes/patches';
import {
	NoteRevisionComparisonService,
	type NoteRevisionComparison
} from '$lib/server/services/notes/revision-diff';
import {
	NoteEditingService as SharedNoteEditingService,
	type NoteEditingRules
} from '$lib/services/notes/editing';
import {
	NoteLifecycleService as SharedNoteLifecycleService,
	type NoteCreationRules,
	type NotePublicationRules,
	type NoteTrashRules
} from '$lib/services/notes/lifecycle';
import { NotePresentationService, type NotePresentation } from '$lib/services/notes/presentation';
import { NoteReferenceService, type NoteReferences } from '$lib/services/notes/references';
import {
	NoteSectionNumberingService,
	type NoteSectionNumbering
} from '$lib/services/notes/section-numbering';
import { NoteTextSearchService, type NoteTextSearch } from '$lib/services/notes/text-search';

import type { NoteMarkdown } from '$lib/models/note-markdown';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import {
	NoteCatalog,
	NoteLifecycleService,
	NoteWriting,
	type NoteAuthoring,
	type NoteCreator,
	type NoteLibrary,
	type NoteTrashLifecycle,
	type NoteTrashReader
} from '$lib/server/services/notes/catalog';
import { NoteProvenance, type ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import {
	SelectionOrigins,
	type SelectionOriginService
} from '$lib/server/services/notes/selection-origin';

export interface NotesCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly now: () => DateTime;
}

export interface NotesCapability {
	readonly archiveImport: NoteArchiveImportPreparation;
	readonly patchPreparation: NotePatchPreparation;
	readonly revisionComparison: NoteRevisionComparison;
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

export const createNotesCapability = (
	actor: ActorContext,
	input: NotesCapabilityInput
): NotesCapability => {
	const repository = new NoteRecords(actor, input.db);
	const anchors = new SourceAnchorRecords(actor, input.db);
	const provenanceRepository = new ProvenanceRecords(actor, input.db);
	const lifecycleRules = new SharedNoteLifecycleService();
	const services = createNoteServices(actor, repository, anchors, input.projects, input.now);
	return {
		archiveImport: new NoteArchiveImportService(),
		patchPreparation: new NotePatchPreparationService(),
		revisionComparison: new NoteRevisionComparisonService(),
		presentation: new NotePresentationService(),
		references: new NoteReferenceService(),
		textSearch: new NoteTextSearchService(),
		sections: new NoteSectionNumberingService(),
		creationRules: lifecycleRules,
		trashRules: lifecycleRules,
		publicationRules: lifecycleRules,
		editingRules: new SharedNoteEditingService(),
		markdown: new NoteMarkdownCodec(),
		repository,
		anchors,
		services,
		selectionOrigins: new SelectionOrigins(actor, repository, anchors, provenanceRepository),
		provenance: new NoteProvenance(actor, provenanceRepository, anchors, input.now),
		provenanceRepository
	};
};

export interface NoteServices {
	readonly library: NoteLibrary;
	readonly trashReader: NoteTrashReader;
	readonly authoring: NoteAuthoring;
	readonly creator: NoteCreator;
	readonly lifecycle: NoteTrashLifecycle;
}
export const createNoteServices = (
	actor: ActorContext,
	notes: NoteRepository,
	anchors: SourceAnchorRepository,
	projects: ProjectRepository,
	now: () => DateTime
): NoteServices => {
	const catalog = new NoteCatalog(notes, projects);
	const writing = new NoteWriting(actor, notes, projects, anchors, now);
	return {
		library: catalog,
		trashReader: catalog,
		authoring: writing,
		creator: writing,
		lifecycle: new NoteLifecycleService(notes, projects)
	};
};
