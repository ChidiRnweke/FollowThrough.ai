import { SvelteDate, createSubscriber } from 'svelte/reactivity';
import type { WorkspaceEnvironment, WorkspaceEvents } from '$lib/controllers/workspace/workspace';
import type { DateTime } from '$lib/models/workspace';
import type { WorkspaceChange } from '$lib/models/workspace-editing';
import { workspaceBootstrapKey } from '$lib/models/workspace-bootstrap';
import { workspaceAccountHint } from './account-hint';
import { isHttpError } from '@sveltejs/kit';

/** Browser events, clocks, Web Locks and the Svelte proxy boundary for the workspace. */
export class BrowserWorkspaceEnvironment implements WorkspaceEnvironment {
	get accountId(): string | null {
		return workspaceAccountHint(document.cookie);
	}
	get online(): boolean {
		return navigator.onLine;
	}
	async settle<T>(request: Promise<T>): Promise<WorkspaceChange<T>> {
		try {
			return { kind: 'saved', value: await request };
		} catch (error) {
			return {
				kind: 'failure',
				message: isHttpError(error)
					? error.body.message
					: error instanceof Error
						? error.message
						: 'The action could not be saved'
			};
		}
	}
	reload(): void {
		window.location.reload();
	}
	listen(events: WorkspaceEvents): () => void {
		const visibility = () => {
			if (document.visibilityState === 'visible') events.refresh();
		};
		const storage = (event: StorageEvent) => {
			if (event.key === workspaceBootstrapKey) events.bootstrapChanged(event.newValue === null);
		};
		window.addEventListener('online', events.refresh);
		window.addEventListener('offline', events.offline);
		window.addEventListener('focus', events.refresh);
		window.addEventListener('storage', storage);
		document.addEventListener('visibilitychange', visibility);
		return () => {
			window.removeEventListener('online', events.refresh);
			window.removeEventListener('offline', events.offline);
			window.removeEventListener('focus', events.refresh);
			window.removeEventListener('storage', storage);
			document.removeEventListener('visibilitychange', visibility);
		};
	}
	now(): DateTime {
		return new SvelteDate().toISOString() as DateTime;
	}
	operationId(): string {
		return crypto.randomUUID();
	}
	/** Svelte proxies cannot cross IndexedDB's structured-clone boundary. */
	snapshot<T>(value: T): T {
		return $state.snapshot(value) as T;
	}
	observe(start: () => void): () => void {
		return createSubscriber(start);
	}
	clock(): number {
		return Date.now();
	}
	schedule(at: number, work: () => Promise<void>): () => void {
		const timer = setTimeout(
			() => {
				void work();
			},
			Math.max(0, at - Date.now())
		);
		return () => clearTimeout(timer);
	}
	/** The browser releases the lock when a tab exits, before another tab recovers its writes. */
	tryWriterLock<T>(
		accountId: string,
		work: () => Promise<T>
	): Promise<{ kind: 'acquired'; value: T } | { kind: 'busy' }> {
		return navigator.locks.request(
			`workspace-sync:write:${accountId}`,
			{ ifAvailable: true },
			async (lock) =>
				lock ? { kind: 'acquired' as const, value: await work() } : { kind: 'busy' as const }
		);
	}
	writerLock<T>(accountId: string, work: () => Promise<T>): Promise<T> {
		return navigator.locks.request(`workspace-sync:write:${accountId}`, work);
	}
}
