import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { SourceAnchor, SourceAnchorId } from '$lib/models/provenance';
/** `update` is how an anchor gets repaired (re-pointed) after its note is edited, not how its quote changes meaning. */
export interface SourceAnchorRepository {
	findById(actor: ActorContext, id: SourceAnchorId): Promise<SourceAnchor | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly SourceAnchor[]>;
	insert(actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor>;
	update(actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor>;
}
