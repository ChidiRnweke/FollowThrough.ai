import type { WorkspaceResourceBinding } from '$lib/models/browser-workspace';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
export interface AttachmentViewState {
	readonly binding: WorkspaceResourceBinding | null;
	readonly local: WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord> | null;
	readonly failure: string | null;
	readonly readGeneration: number;
	readonly unsubscribe: (() => void) | null;
	bind(binding: WorkspaceResourceBinding): void;
	setSubscription(unsubscribe: (() => void) | null): void;
	advanceRead(): number;
	publish(local: WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord>): void;
	fail(message: string): void;
}
/** Passive attachment observations. The controller owns reads and subscriptions. */
export class AttachmentViewStore implements AttachmentViewState {
	private bound: WorkspaceResourceBinding | null = null;
	private projection = $state.raw<WorkspaceLocalProjection<
		WorkspaceCommand,
		WorkspaceRecord
	> | null>(null);
	private error = $state<string | null>(null);
	private generation = 0;
	private subscription: (() => void) | null = null;
	get binding(): WorkspaceResourceBinding | null {
		return this.bound;
	}
	get local(): WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord> | null {
		return this.projection;
	}
	get failure(): string | null {
		return this.error;
	}
	get readGeneration(): number {
		return this.generation;
	}
	get unsubscribe(): (() => void) | null {
		return this.subscription;
	}
	bind(binding: WorkspaceResourceBinding): void {
		this.bound = binding;
		this.projection = null;
		this.error = null;
		this.generation++;
	}
	setSubscription(unsubscribe: (() => void) | null): void {
		this.subscription = unsubscribe;
	}
	advanceRead(): number {
		return ++this.generation;
	}
	publish(local: WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord>): void {
		this.projection = local;
		this.error = null;
		this.generation++;
	}
	fail(message: string): void {
		this.error = message;
		this.generation++;
	}
}
