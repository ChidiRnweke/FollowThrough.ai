import type { ActorContext, NoteId, NoteRelationship, RelationshipId } from '../models';
export interface NoteRelationshipRepository {
	findById(actor: ActorContext, id: RelationshipId): Promise<NoteRelationship | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]>;
	insert(actor: ActorContext, relationship: NoteRelationship): Promise<NoteRelationship>;
	delete(actor: ActorContext, id: RelationshipId): Promise<void>;
}
