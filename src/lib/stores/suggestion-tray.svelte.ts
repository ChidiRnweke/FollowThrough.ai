import { invalidateAll } from '$app/navigation';
import type { SuggestionId, SuggestionView } from '$lib/models';
import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions.remote';

class SuggestionTrayStore {
	items = $state<SuggestionView[]>([]);

	replace(views: readonly SuggestionView[]): void {
		this.items = [...views];
	}
	add(views: readonly SuggestionView[]): void {
		const known = new Set(this.items.map((item) => item.suggestion.id));
		this.items = [...this.items, ...views.filter((view) => !known.has(view.suggestion.id))];
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
	busyIds = $state<SuggestionId[]>([]);
	clear(): void {
		this.items = [];
	}
}

export const suggestionTray = new SuggestionTrayStore();
