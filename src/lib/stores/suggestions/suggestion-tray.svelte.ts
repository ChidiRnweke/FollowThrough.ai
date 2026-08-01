import { invalidateAll } from '$app/navigation';
import type { DiagramSuggestion } from '$lib/models/diagrams';
import type { SuggestionId, SuggestionView } from '$lib/models/suggestions';
import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions/suggestions.remote';

export class SuggestionTrayStore {
	items = $state<SuggestionView[]>([]);
	reviewRequested = $state<DiagramSuggestion | null>(null);
	busyIds = $state<SuggestionId[]>([]);

	replace(views: readonly SuggestionView[]): void {
		this.items = [...views];
	}
	add(views: readonly SuggestionView[]): void {
		const known = this.items.map((item) => item.suggestion.id);
		this.items = [...this.items, ...views.filter((view) => !known.includes(view.suggestion.id))];
	}
	remove(suggestionId: SuggestionId): void {
		this.items = this.items.filter((item) => item.suggestion.id !== suggestionId);
	}
	async decide(suggestionId: SuggestionId, decision: 'accept' | 'reject'): Promise<boolean> {
		this.busyIds = [...this.busyIds, suggestionId];
		try {
			if (decision === 'accept') await acceptSuggestion({ suggestionId });
			else await rejectSuggestion({ suggestionId });
			this.remove(suggestionId);
			await invalidateAll();
			return true;
		} catch {
			return false;
		} finally {
			this.busyIds = this.busyIds.filter((id) => id !== suggestionId);
		}
	}
	requestReview(suggestion: DiagramSuggestion): void {
		this.reviewRequested = suggestion;
	}
	clearReview(): void {
		this.reviewRequested = null;
	}
	clear(): void {
		this.items = [];
	}
}

export const suggestionTray = new SuggestionTrayStore();
