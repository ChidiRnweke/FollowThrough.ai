import type { ActorContext, NoteId, SourceAnchor, SourceAnchorId } from '$lib/models';
export interface SourceAnchorRepository {
	findById(actor: ActorContext, id: SourceAnchorId): Promise<SourceAnchor | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly SourceAnchor[]>;
	insert(actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor>;
	update(actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor>;
}
