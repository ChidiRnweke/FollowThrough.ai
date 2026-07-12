import { invalidateAll } from '$app/navigation';
import type { SuggestionId, SuggestionView } from '$lib/models';

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
			const response = await fetch('/api/suggestions', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ suggestionId, decision })
			});
			if (response.ok) {
				this.remove(suggestionId);
				await invalidateAll();
			}
			return response.ok;
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
