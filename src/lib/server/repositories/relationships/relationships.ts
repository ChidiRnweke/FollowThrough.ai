import type { ActorContext } from '$lib/models/identity';
import type { NoteId, NoteRelationship } from '$lib/models/notes';
import type { RelationshipId } from '$lib/models/relationships';
/** Derived from the note document: the save transaction rewrites these rows to match `collectNoteLinkTargets`, so they never diverge from the body's actual links. */
export interface NoteRelationshipRepository {
	findById(id: RelationshipId): Promise<NoteRelationship | undefined>;
	listForNote(noteId: NoteId): Promise<readonly NoteRelationship[]>;
	insert(relationship: NoteRelationship): Promise<NoteRelationship>;
	/** Lock the semantic edge until the caller's transaction completes, including absent edges. */
	findForWrite(
		edge: Pick<NoteRelationship, 'sourceNoteId' | 'targetNoteId' | 'kind'>
	): Promise<NoteRelationship | undefined>;
	update(relationship: NoteRelationship): Promise<NoteRelationship>;
	delete(id: RelationshipId): Promise<void>;
}
