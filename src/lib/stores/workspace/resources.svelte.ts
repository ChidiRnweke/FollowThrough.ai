import { SvelteMap } from 'svelte/reactivity';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
interface WorkspaceResourceState {
	readonly revision: number;
	readonly local: WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord> | null;
	readonly stopped: boolean;
	readonly failure: { readonly kind: 'failure'; readonly message: string } | null;
}
/** Account lifetime. Independent signals keep cache updates from invalidating lifetime observers. */
export class WorkspaceResourceStore {
	private revisionValue = $state(0);
	private localValue = $state.raw<WorkspaceResourceState['local']>(null);
	private stoppedValue = $state(false);
	private failureValue = $state<WorkspaceResourceState['failure']>(null);
	private readonly cached = $derived(
		new SvelteMap(this.localValue?.cache.records.map((row) => [row.key, row.entry]) ?? [])
	);
	private pending: Promise<void> | null = null;
	private subscriptions: (() => void)[] = [];
	get revision(): number {
		return this.revisionValue;
	}
	get local(): WorkspaceResourceState['local'] {
		return this.localValue;
	}
	get stopped(): boolean {
		return this.stoppedValue;
	}
	get failure(): WorkspaceResourceState['failure'] {
		return this.failureValue;
	}
	get records() {
		return this.cached;
	}
	get initializing(): Promise<void> | null {
		return this.pending;
	}
	setInitializing(value: Promise<void> | null): void {
		this.pending = value;
	}
	update(change: Partial<WorkspaceResourceState>): void {
		if (change.revision !== undefined) this.revisionValue = change.revision;
		if (change.local !== undefined) this.localValue = change.local;
		if (change.stopped !== undefined) this.stoppedValue = change.stopped;
		if (change.failure !== undefined) this.failureValue = change.failure;
	}
	invalidate(): void {
		this.revisionValue++;
	}
	addSubscriptions(...subscriptions: (() => void)[]): void {
		this.subscriptions.push(...subscriptions);
	}
	takeSubscriptions(): readonly (() => void)[] {
		return this.subscriptions.splice(0);
	}
}
