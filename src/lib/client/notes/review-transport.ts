import type { NoteReviewRemote } from '$lib/models/browser-workspace';
import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions/suggestions.remote';
export class RemoteNoteReviews implements NoteReviewRemote {
	accept(input: Parameters<NoteReviewRemote['accept']>[0]) {
		return acceptSuggestion(input);
	}
	reject(input: Parameters<NoteReviewRemote['reject']>[0]) {
		return rejectSuggestion(input);
	}
}
