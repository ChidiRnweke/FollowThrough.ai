import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId, NoteRevision } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
/** `updateIfRevision` is the compare-and-swap write the sync protocol depends on: a stale expected revision fails instead of overwriting. */
export interface NoteRepository {
	findById(actor: ActorContext, id: NoteId): Promise<Note | undefined>;
	findByBuiltInKey(actor: ActorContext, key: string): Promise<Note | undefined>;
	listActive(actor: ActorContext, projectId?: ProjectId): Promise<readonly Note[]>;
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
	restoreAttachmentSnapshot(
		actor: ActorContext,
		revisionId: NoteRevision['id'],
		noteId: NoteId
	): Promise<void>;
}
