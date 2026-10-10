import type { WorkspaceBootstrap, StoredBootstrap } from '$lib/models/workspace-bootstrap';
import type {
	WorkspaceSessionEnvironment,
	WorkspaceSessionEvents,
	WorkspaceRecovery
} from '$lib/controllers/workspace/session';

export class InMemoryWorkspaceSessionEnvironment implements WorkspaceSessionEnvironment {
	accountId: string | null;
	online = true;
	stored: StoredBootstrap = { kind: 'absent' };
	saved: WorkspaceBootstrap | null = null;
	reloaded = false;
	failure: Error | null = null;
	private events: WorkspaceSessionEvents | null = null;
	private gate: { started(): void; ready: Promise<void> } | null = null;
	constructor(readonly bootstrap: WorkspaceBootstrap) {
		this.accountId = bootstrap.accountId;
	}
	readBootstrap(): StoredBootstrap {
		return this.stored;
	}
	async fetchBootstrap(): Promise<WorkspaceBootstrap> {
		const gate = this.gate;
		this.gate = null;
		if (gate) {
			gate.started();
			await gate.ready;
		}
		if (this.failure) throw this.failure;
		return this.bootstrap;
	}
	pauseBootstrap(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.gate = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	saveBootstrap(bootstrap: WorkspaceBootstrap): void {
		this.saved = bootstrap;
		this.stored = { kind: 'stored', value: bootstrap };
	}
	clearBootstrap(): void {
		this.saved = null;
		this.stored = { kind: 'absent' };
	}
	reload(): void {
		this.reloaded = true;
	}
	listen(events: WorkspaceSessionEvents): () => void {
		this.events = events;
		return () => {
			if (this.events === events) this.events = null;
		};
	}
	focus(): void {
		this.events?.refresh();
	}
}

export class InMemoryWorkspaceRecovery implements WorkspaceRecovery {
	readonly accounts = new Map<string, Blob>();
	async downloadAccount(accountId: string): Promise<Blob> {
		const saved = this.accounts.get(accountId);
		if (!saved) throw new Error('No saved workspace');
		return saved;
	}
	async resetAccount(accountId: string): Promise<void> {
		this.accounts.delete(accountId);
	}
}
