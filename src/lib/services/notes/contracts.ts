import type {
	ActorContext,
	CreateNoteInput,
	Note,
	NoteId,
	NoteSummary,
	Provenance,
	ProjectId,
	SourceAnchor,
	TextSelection
} from '$lib/models';
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
