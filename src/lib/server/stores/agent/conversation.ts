import type { PersistedSessionItem } from '$lib/models/agent';
/** One execution's complete history and its derived provider view. */
export class ConversationSessionStore {
	private items: readonly PersistedSessionItem[] | undefined;
	private shown: readonly PersistedSessionItem[] | undefined;
	get loaded() {
		return this.items;
	}
	get presented() {
		return this.shown;
	}
	replace(items: readonly PersistedSessionItem[]): void {
		this.items = items;
		this.shown = undefined;
	}
	present(items: readonly PersistedSessionItem[]): void {
		this.shown = items;
	}
}
