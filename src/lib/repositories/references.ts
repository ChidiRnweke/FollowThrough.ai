import type { ActorContext, ExternalReference, NoteId, ReferenceId } from '../models';
export interface ReferenceRepository {
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly ExternalReference[]>;
	insert(actor: ActorContext, reference: ExternalReference): Promise<ExternalReference>;
	delete(actor: ActorContext, id: ReferenceId): Promise<void>;
}
