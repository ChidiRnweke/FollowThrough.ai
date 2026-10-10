import { OutboxEditingService, OutboxDeliveryService } from '$lib/services/sync/state';
import {
	MutationSubmission,
	type MutationQueueController,
	type SubmissionLane,
	type MutationQueueDependencies
} from '$lib/controllers/sync/submission';
import {
	WorkspaceSynchronization,
	type WorkspaceSynchronizationController
} from '$lib/controllers/sync/execution';
import { SyncExecutionStore } from '$lib/stores/sync/execution';
import { MutationQueueStore } from '$lib/stores/sync/submission';
import { SyncSchedulingService } from '$lib/services/sync/scheduling';

export interface MutationQueueCapability<C, T> {
	readonly writes: MutationQueueController<C, T>;
	readonly execution: WorkspaceSynchronizationController;
}

export const createMutationQueue = <C, T>(
	accountId: string,
	dependencies: MutationQueueDependencies<C, T>
): MutationQueueCapability<C, T> => {
	const execution: WorkspaceSynchronizationController = new WorkspaceSynchronization(
		{
			scheduler: dependencies.scheduler,
			pull: dependencies.pull,
			writes: () => writes.submit(),
			failed: () => writes.notify()
		},
		new SyncExecutionStore(),
		new SyncSchedulingService()
	);
	const writes: MutationQueueController<C, T> & SubmissionLane = new MutationSubmission(
		accountId,
		dependencies,
		new MutationQueueStore<C, T>(),
		execution,
		new OutboxEditingService(),
		new OutboxDeliveryService()
	);
	return { writes, execution };
};
