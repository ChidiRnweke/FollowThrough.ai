import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceSessionStore } from './session.svelte';
import type { WorkspaceResourceStore } from './resources.svelte';
import type { WorkspaceDraftStore, ResourceObservationStore } from './draft.svelte';
import type { WorkspaceProjectionStore } from './projection.svelte';
import type { ResourceCacheStore } from '../sync/cache';
import type { MutationQueueStore } from '../sync/submission';
import type { SyncExecutionStore } from '../sync/execution';

/** Explicit state owners: the tab's binding and, per account, its replica and runtime state. */
export interface WorkspaceStores {
	readonly session: WorkspaceSessionStore;
	readonly projection: WorkspaceProjectionStore;
	account(): {
		readonly resources: WorkspaceResourceStore;
		readonly cache: ResourceCacheStore<WorkspaceRecord>;
		readonly queue: MutationQueueStore<WorkspaceCommand, WorkspaceRecord>;
		readonly execution: SyncExecutionStore;
	};
	draft(): WorkspaceDraftStore;
	observation(): ResourceObservationStore;
}
