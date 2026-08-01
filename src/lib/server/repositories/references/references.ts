import type { ActorContext } from '$lib/models/identity';
import type { ExternalReference, ReferenceId } from '$lib/models/references';
import type { NoteId } from '$lib/models/notes';
export interface ReferenceRepository {
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly ExternalReference[]>;
	insert(actor: ActorContext, reference: ExternalReference): Promise<ExternalReference>;
	delete(actor: ActorContext, id: ReferenceId): Promise<void>;
}
