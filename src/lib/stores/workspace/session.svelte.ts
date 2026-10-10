import type { WorkspaceSession } from '$lib/controllers/workspace/session';
import type {
	WorkspaceResourceBinding,
	WorkspaceBindingState
} from '$lib/models/browser-workspace';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
interface SessionRecord extends WorkspaceSession {
	bootstrap: WorkspaceBootstrap;
	startupError: string | null;
}
/** Browser account lifetime. Updates never fetch, subscribe, recover storage or run workflows. */
export interface WorkspaceSessionStateAccess {
	readonly resourceBinding: WorkspaceResourceBinding | null;
	readonly accountId: string | null;
	readonly startupError: string | null;
	refreshAt(generation: number, bootstrap: WorkspaceBootstrap): void;
	failAt(generation: number, message: string): void;
	readonly required: WorkspaceSession;
	readonly current: WorkspaceSession | null;
	readonly starting: Promise<WorkspaceSession> | null;
	readonly generation: number;
	readonly detach: (() => void) | null;
	publish(session: WorkspaceSession): void;
	start(pending: Promise<WorkspaceSession>): void;
	attach(detach: () => void): void;
	refresh(session: WorkspaceSession, bootstrap: WorkspaceBootstrap): void;
	fail(session: WorkspaceSession, message: string): void;
	clear(): void;
}
export class WorkspaceSessionStore implements WorkspaceSessionStateAccess, WorkspaceBindingState {
	private value = $state<SessionRecord | null>(null);
	private pending: Promise<WorkspaceSession> | null = null;
	private version = $state(0);
	private unsubscribe: (() => void) | null = null;
	get resourceBinding(): WorkspaceResourceBinding | null {
		return this.value
			? {
					accountId: this.value.bootstrap.accountId,
					generation: this.version,
					resourceKey: this.value.resources
				}
			: null;
	}
	get accountId(): string | null {
		return this.value?.bootstrap.accountId ?? null;
	}
	get startupError(): string | null {
		return this.value?.startupError ?? null;
	}
	refreshAt(generation: number, bootstrap: WorkspaceBootstrap): void {
		if (this.version !== generation || this.value?.bootstrap.accountId !== bootstrap.accountId)
			return;
		this.value.bootstrap = bootstrap;
		this.value.startupError = null;
	}
	failAt(generation: number, message: string): void {
		if (this.version === generation && this.value) this.value.startupError = message;
	}

	get required(): WorkspaceSession {
		if (!this.value) throw new Error('Open the workspace before mounting a note');
		return this.value;
	}

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
