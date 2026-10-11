import { SvelteSet } from 'svelte/reactivity';
import type { TodoId } from '$lib/models/todos';

/** Which todos have a save in flight, whether one is being created, and the last refusal. */
export class TodoUpdatesStore {
	creating = $state(false);
	readonly pendingIds = new SvelteSet<TodoId>();
	lastError = $state<string | null>(null);
	setCreating(creating: boolean): void {
		this.creating = creating;
	}
	begin(todoId: TodoId): void {
		this.pendingIds.add(todoId);
	}
	finish(todoId: TodoId): void {
		this.pendingIds.delete(todoId);
	}
	report(error: string | null): void {
		this.lastError = error;
	}
}
export const todoUpdateState = new TodoUpdatesStore();
