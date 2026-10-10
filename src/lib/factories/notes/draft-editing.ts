import {
	NoteDraftEditing,
	type NoteDraftEditingController,
	type NoteDraftPersistence
} from '$lib/controllers/notes/draft-editing';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import type { NoteId } from '$lib/models/notes';
export const createNoteDraftEditing = (
	noteId: NoteId,
	draft: NoteDraftPersistence
): NoteDraftEditingController =>
	new NoteDraftEditing(noteId, draft, new NoteSectionNumberingService());
