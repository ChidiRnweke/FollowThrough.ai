import type { SuggestionId } from '$lib/models/suggestions';

/** Which suggestion awaits review and which decisions are in flight. */
export class SuggestionActions {
	reviewRequested = $state<SuggestionId | null>(null);
	busyIds = $state<SuggestionId[]>([]);
	begin(suggestionId: SuggestionId): void {
		this.busyIds = [...this.busyIds, suggestionId];
	}
	finish(suggestionId: SuggestionId): void {
		this.busyIds = this.busyIds.filter((id) => id !== suggestionId);
	}
	requestReview(suggestionId: SuggestionId): void {
		this.reviewRequested = suggestionId;
	}
	clearReview(): void {
		this.reviewRequested = null;
	}
}

export const suggestionActions = new SuggestionActions();
