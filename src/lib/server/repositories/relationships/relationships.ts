import type { ActorContext } from '$lib/models/identity';
import type { NoteId, NoteRelationship } from '$lib/models/notes';
import type { RelationshipId } from '$lib/models/relationships';
/** Derived from the note document: the save transaction rewrites these rows to match `collectNoteLinkTargets`, so they never diverge from the body's actual links. */
export interface NoteRelationshipRepository {
	findById(actor: ActorContext, id: RelationshipId): Promise<NoteRelationship | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]>;
	insert(actor: ActorContext, relationship: NoteRelationship): Promise<NoteRelationship>;
	delete(actor: ActorContext, id: RelationshipId): Promise<void>;
}
