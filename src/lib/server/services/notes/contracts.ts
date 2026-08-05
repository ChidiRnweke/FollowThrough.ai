import type { ActorContext } from '$lib/models/identity';
import type {
	CreateNoteInput,
	Note,
	NoteId,
	NoteRevision,
	NoteRevisionId,
	NoteSummary,
	TextSelection,
	TrashedNote
} from '$lib/models/notes';
import type { Provenance, SourceAnchor } from '$lib/models/provenance';
import type { ProjectId } from '$lib/models/projects';
export interface NoteCreator {
	create(actor: ActorContext, input: CreateNoteInput): Promise<Note>;
}
export interface NoteReader {
	get(actor: ActorContext, noteId: NoteId): Promise<Note>;
}
export interface NoteTreeReader {
	list(actor: ActorContext, projectId?: ProjectId): Promise<readonly NoteSummary[]>;
}
export interface NoteEditor {
	save(actor: ActorContext, note: Note): Promise<Note>;
}
export interface NoteArchiver {
	archive(actor: ActorContext, noteId: NoteId): Promise<Note>;
	restore(actor: ActorContext, noteId: NoteId): Promise<Note>;
}
export interface NoteRevisionRecorder {
	record(actor: ActorContext, note: Note, provenance?: Provenance): Promise<void>;
}
export interface NoteRevisionReader {
	latestRevision(actor: ActorContext, noteId: NoteId): Promise<NoteRevision | undefined>;
	/** Every kept snapshot of a note, newest first. */
	revisions(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRevision[]>;
	revisionById(
		actor: ActorContext,
		noteId: NoteId,
		revisionId: NoteRevisionId
	): Promise<NoteRevision | undefined>;
}
export interface NoteAttachmentRestorer {
	restoreAttachments(
		actor: ActorContext,
		noteId: NoteId,
		revisionId: NoteRevisionId
	): Promise<void>;
}
export interface NoteTrashReader {
	listTrashed(actor: ActorContext, projectId?: ProjectId): Promise<readonly TrashedNote[]>;
}
export interface NotePublisher {
	markPublished(actor: ActorContext, noteId: NoteId): Promise<Note>;
}
export interface NoteImporter {
	import(actor: ActorContext, markdown: string): Promise<Note>;
}
export interface NoteExporter {
	export(actor: ActorContext, noteId: NoteId): Promise<string>;
}
export interface SelectionAnchorCreator {
	create(actor: ActorContext, selection: TextSelection): Promise<SourceAnchor>;
}
export interface SourceAnchorResolver {
	resolve(
		actor: ActorContext,
		anchorId: SourceAnchor['id']
	): Promise<{ noteId: NoteId; from: number; to: number }>;
}
export interface SourceAnchorRepairer {
	repairForNote(actor: ActorContext, note: Note): Promise<readonly SourceAnchor[]>;
}
export interface NoteIndexer {
	index(actor: ActorContext, note: Note): Promise<void>;
}
