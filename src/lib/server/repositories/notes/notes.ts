import type {
	Note,
	NoteId,
	NoteRevision,
	NoteSearchTarget,
	NotePublicationWrite,
	NoteBuiltInRepairWrite
} from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
/** `updateIfRevision` is the compare-and-swap write the sync protocol depends on: a stale expected revision fails instead of overwriting. */
export interface NoteRepository {
	updatePublication(write: NotePublicationWrite): Promise<Note | undefined>;
	/** Retain the note row lock until the caller transaction ends. */
	findForWrite(id: NoteId): Promise<Note | undefined>;
	updateTrash(note: Note): Promise<Note>;
	findById(id: NoteId): Promise<Note | undefined>;
	findBuiltInForWrite(key: string): Promise<Note | undefined>;
	repairBuiltIn(write: NoteBuiltInRepairWrite): Promise<Note | undefined>;
	findByBuiltInKey(key: string): Promise<Note | undefined>;
	listActive(projectId?: ProjectId): Promise<readonly Note[]>;
	/**
	 * The search projection of {@link listActive}: only the columns exact text search
	 * reads, so a global search never ships every note's document body out of the database.
	 */
	listSearchable(projectId?: ProjectId): Promise<readonly NoteSearchTarget[]>;
	/** The complement of {@link listActive}: notes in the trash, most recently discarded first. */
	listTrashed(projectId?: ProjectId): Promise<readonly Note[]>;
	countSiblings(projectId: ProjectId, parentId?: NoteId): Promise<number>;
	insert(note: Note): Promise<Note>;
	/**
	 * Targeted write for the note's section-numbering override (`null` clears it back to
	 * inherit), kept off document writes so the sync protocol can never clobber it with a
	 * stale device copy.
	 */
	setSectionNumbering(id: NoteId, enabled: boolean | null): Promise<Note>;
	updateIfRevision(note: Note, expectedRevision: number): Promise<Note | undefined>;
	deleteTrashed(id: NoteId): Promise<Pick<Note, 'id' | 'title'> | undefined>;
	insertRevision(revision: NoteRevision): Promise<NoteRevision>;
	listRevisions(noteId: NoteId): Promise<readonly NoteRevision[]>;
	/** Drop all but the newest `keepNewest` revisions of a note, so history stays bounded. */
	pruneRevisions(noteId: NoteId, keepNewest: number): Promise<void>;
	restoreAttachmentSnapshot(revisionId: NoteRevision['id'], noteId: NoteId): Promise<void>;
}
