import type { WorkspaceSession } from '$lib/controllers/workspace/session';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
interface SessionRecord extends WorkspaceSession {
	bootstrap: WorkspaceBootstrap;
	startupError: string | null;
}
/** Browser account lifetime. Updates never fetch, subscribe, recover storage or run workflows. */
export class WorkspaceSessionStore {
	private value = $state<SessionRecord | null>(null);
	private pending: Promise<WorkspaceSession> | null = null;
	private version = 0;
	private unsubscribe: (() => void) | null = null;
	get current(): WorkspaceSession | null {
		return this.value;
	}
	get starting(): Promise<WorkspaceSession> | null {
		return this.pending;
	}
	get generation(): number {
		return this.version;
	}
	get detach(): (() => void) | null {
		return this.unsubscribe;
	}
	publish(session: WorkspaceSession): void {
		this.value = session;
	}
	start(pending: Promise<WorkspaceSession>): void {
		this.pending = pending;
	}
	attach(detach: () => void): void {
		this.unsubscribe = detach;
	}
	refresh(session: WorkspaceSession, bootstrap: WorkspaceBootstrap): void {
		if (this.value !== session) return;
		this.value.bootstrap = bootstrap;
		this.value.startupError = null;
	}
	fail(session: WorkspaceSession, message: string): void {
		if (this.value === session) this.value.startupError = message;
	}
	clear(): void {
		this.version++;
		this.value = null;
		this.pending = null;
		this.unsubscribe = null;
	}
}
