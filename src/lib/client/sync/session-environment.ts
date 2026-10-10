import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import type {
	WorkspaceSessionEnvironment,
	WorkspaceSessionEvents
} from '$lib/controllers/workspace/session';
import {
	readStoredBootstrap,
	storeBootstrap,
	clearBootstrap,
	workspaceBootstrapKey,
	workspaceAccountHint
} from './bootstrap-storage';
import { fetchWorkspaceBootstrap } from './workspace-transport';
/** Browser storage and event mechanics; controller callbacks own every response to these events. */
export class BrowserWorkspaceSessionEnvironment implements WorkspaceSessionEnvironment {
	get accountId(): string | null {
		return workspaceAccountHint(document.cookie);
	}
	get online(): boolean {
		return navigator.onLine;
	}
	readBootstrap() {
		return readStoredBootstrap(localStorage.getItem(workspaceBootstrapKey), this.accountId);
	}
	fetchBootstrap(): Promise<WorkspaceBootstrap> {
		return fetchWorkspaceBootstrap();
	}
	saveBootstrap(bootstrap: WorkspaceBootstrap): void {
		storeBootstrap(localStorage, bootstrap);
	}
	clearBootstrap(): void {
		clearBootstrap(localStorage);
	}
	reload(): void {
		window.location.reload();
	}
	listen(events: WorkspaceSessionEvents): () => void {
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
}
