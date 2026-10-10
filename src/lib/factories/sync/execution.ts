import {
	WorkspaceSynchronization,
	type WorkspaceSynchronizationController,
	type WorkspaceSynchronizationDependencies
} from '$lib/controllers/sync/execution';
import { SyncExecutionStore } from '$lib/stores/sync/execution';
import { SyncSchedulingService } from '$lib/services/sync/scheduling';

export const createWorkspaceSynchronization = (
	dependencies: WorkspaceSynchronizationDependencies
): WorkspaceSynchronizationController =>
	new WorkspaceSynchronization(dependencies, new SyncExecutionStore(), new SyncSchedulingService());
