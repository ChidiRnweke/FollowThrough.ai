import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId, NoteRevision } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
/** `updateIfRevision` is the compare-and-swap write the sync protocol depends on: a stale expected revision fails instead of overwriting. */
export interface NoteRepository {
	findById(actor: ActorContext, id: NoteId): Promise<Note | undefined>;
	findByBuiltInKey(actor: ActorContext, key: string): Promise<Note | undefined>;
	listActive(actor: ActorContext, projectId?: ProjectId): Promise<readonly Note[]>;
	/** The complement of {@link listActive}: notes in the trash, most recently discarded first. */
	listTrashed(actor: ActorContext, projectId?: ProjectId): Promise<readonly Note[]>;
	countSiblings(actor: ActorContext, projectId: ProjectId, parentId?: NoteId): Promise<number>;
	insert(actor: ActorContext, note: Note): Promise<Note>;
	update(actor: ActorContext, note: Note): Promise<Note>;
	updateIfRevision(
		actor: ActorContext,
		note: Note,
		expectedRevision: number
	): Promise<Note | undefined>;
	delete(actor: ActorContext, id: NoteId): Promise<void>;
	insertRevision(actor: ActorContext, revision: NoteRevision): Promise<NoteRevision>;
	listRevisions(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRevision[]>;
	/** Drop all but the newest `keepNewest` revisions of a note, so history stays bounded. */
	pruneRevisions(actor: ActorContext, noteId: NoteId, keepNewest: number): Promise<void>;
	restoreAttachmentSnapshot(
		actor: ActorContext,
		revisionId: NoteRevision['id'],
		noteId: NoteId
	): Promise<void>;
}
