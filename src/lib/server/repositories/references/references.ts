import type { ExternalReference, ReferenceId } from '$lib/models/references';
import type { NoteId } from '$lib/models/notes';
/** External links proposed for a note, always inserted with the anchor and provenance that justified them. */
export interface ReferenceRepository {
	listForNote(noteId: NoteId): Promise<readonly ExternalReference[]>;
	insert(reference: ExternalReference): Promise<ExternalReference>;
	delete(id: ReferenceId): Promise<void>;
}
