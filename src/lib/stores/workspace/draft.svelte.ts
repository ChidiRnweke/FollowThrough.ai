import type { WorkspaceEditContext } from '$lib/models/workspace-editing';
interface WorkspaceDraftState {
	readonly current: WorkspaceEditContext | null;
	readonly savingLocal: number;
	readonly error: string | null;
}
/** One editor's observed base and pending local persistence. */
export class WorkspaceDraftStore {
	private value = $state.raw<WorkspaceDraftState>({ current: null, savingLocal: 0, error: null });
	private pending: Promise<void> = Promise.resolve();
	read(): WorkspaceDraftState {
		return this.value;
	}
	update(change: Partial<WorkspaceDraftState>): void {
		this.value = { ...this.value, ...change };
	}
	get staging(): Promise<void> {
		return this.pending;
	}
	setStaging(pending: Promise<void>): void {
		this.pending = pending;
	}
}
export class ResourceObservationStore {
	private value = $state<{ readonly kind: 'failure'; readonly message: string } | null>(null);
	get failure() {
		return this.value;
	}
	setFailure(value: { readonly kind: 'failure'; readonly message: string } | null): void {
		this.value = value;
	}
}
