import type { ActorContext, Note, NoteId, NoteRevision, ProjectId } from '../models';
export interface NoteRepository {
	findById(actor: ActorContext, id: NoteId): Promise<Note | undefined>;
	listActive(actor: ActorContext, projectId?: ProjectId): Promise<readonly Note[]>;
	countSiblings(actor: ActorContext, projectId: ProjectId, parentId?: NoteId): Promise<number>;
	insert(actor: ActorContext, note: Note): Promise<Note>;
	update(actor: ActorContext, note: Note): Promise<Note>;
	delete(actor: ActorContext, id: NoteId): Promise<void>;
	insertRevision(actor: ActorContext, revision: NoteRevision): Promise<NoteRevision>;
	listRevisions(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRevision[]>;
	restoreAttachmentSnapshot(
		actor: ActorContext,
		revisionId: NoteRevision['id'],
		noteId: NoteId
	): Promise<void>;
}
