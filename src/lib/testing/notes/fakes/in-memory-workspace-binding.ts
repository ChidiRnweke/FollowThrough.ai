import type {
	WorkspaceAccountEnvironment,
	WorkspaceBindingState
} from '$lib/models/browser-workspace';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import type { SyncExecutionStore } from '$lib/stores/sync/execution';
/** Account binding and browser connectivity, independently controllable from a mounted pane. */
export class InMemoryWorkspaceBinding
	implements WorkspaceBindingState, WorkspaceAccountEnvironment
{
	generation = 0;
	startupError: string | null = null;
	detach = null;
	get online(): boolean {
		return this.connection.online;
	}
	reloaded = false;
	disposed = false;
	constructor(
		public accountId: string | null,
		private readonly connection: SyncExecutionStore
	) {}
	refreshAt(generation: number, bootstrap: WorkspaceBootstrap): void {
		if (generation === this.generation && bootstrap.accountId === this.accountId)
			this.startupError = null;
	}
	failAt(generation: number, message: string): void {
		if (generation === this.generation) this.startupError = message;
	}
	clear(): void {
		this.generation++;
		this.accountId = null;
	}
	async fetchBootstrap(): Promise<WorkspaceBootstrap> {
		throw new Error('Startup transport is unavailable');
	}
	saveBootstrap(_bootstrap: WorkspaceBootstrap): void {}
	reload(): void {
		this.reloaded = true;
	}
}
