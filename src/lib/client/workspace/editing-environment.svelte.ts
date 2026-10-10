import type { WorkspaceEditingEnvironment } from '$lib/models/browser-workspace';
import { SvelteDate, createSubscriber } from 'svelte/reactivity';

import type { DateTime } from '$lib/models/workspace';
/** Svelte proxies cannot cross IndexedDB's structured-clone boundary. */
export class BrowserWorkspaceEditingEnvironment implements WorkspaceEditingEnvironment {
	now(): DateTime {
		return new SvelteDate().toISOString() as DateTime;
	}
	operationId(): string {
		return crypto.randomUUID();
	}
	snapshot<T>(value: T): T {
		return $state.snapshot(value) as T;
	}
	observe(start: () => void): () => void {
		return createSubscriber(start);
	}
}
