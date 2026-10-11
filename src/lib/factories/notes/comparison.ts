import { NoteComparisons, type NoteComparisonController } from '$lib/controllers/notes/comparison';
import { NoteComparisonService } from '$lib/services/notes/note-diff';
export const noteComparison: NoteComparisonController = new NoteComparisons(
	new NoteComparisonService()
);
