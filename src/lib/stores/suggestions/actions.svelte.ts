import { workspaceSession } from '$lib/stores/workspace/session.svelte';
import type { SuggestionId } from '$lib/models/suggestions';
import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions/suggestions.remote';

export class SuggestionActions {
	reviewRequested = $state<SuggestionId | null>(null);
	busyIds = $state<SuggestionId[]>([]);

	async decide(suggestionId: SuggestionId, decision: 'accept' | 'reject'): Promise<boolean> {
		this.busyIds = [...this.busyIds, suggestionId];
		try {
			if (decision === 'accept') await acceptSuggestion({ suggestionId });
			else await rejectSuggestion({ suggestionId });
			await workspaceSession.synchronize();
			return true;
			// audit-allow: silent-catch — false is the tray's typed outcome; the suggestion stays visible and actionable.
		} catch {
			return false;
		} finally {
			this.busyIds = this.busyIds.filter((id) => id !== suggestionId);
		}
	}
	requestReview(suggestionId: SuggestionId): void {
		this.reviewRequested = suggestionId;
	}
	clearReview(): void {
		this.reviewRequested = null;
	}
}

export const suggestionActions = new SuggestionActions();
