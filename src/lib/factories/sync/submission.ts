import {
	WorkspaceSynchronization,
	type WorkspaceSynchronizationController
} from '$lib/controllers/sync/execution';
import {
	MutationSubmission,
	type MutationQueueController,
	type MutationQueueDependencies,
	type SubmissionLane
} from '$lib/controllers/sync/submission';
import { SyncSchedulingService } from '$lib/services/sync/scheduling';
import { OutboxDeliveryService, OutboxEditingService } from '$lib/services/sync/state';
import { SyncExecutionStore } from '$lib/stores/sync/execution';
import { MutationQueueStore } from '$lib/stores/sync/submission';

export interface MutationQueueCapability<C, T> {
	readonly writes: MutationQueueController<C, T>;
	readonly execution: WorkspaceSynchronizationController;
}

export const createMutationQueue = <C, T>(
	accountId: string,
	dependencies: MutationQueueDependencies<C, T>,
	executionState = new SyncExecutionStore(),
	queueState = new MutationQueueStore<C, T>()
): MutationQueueCapability<C, T> => {
	const execution: WorkspaceSynchronizationController = new WorkspaceSynchronization(
		{
			scheduler: dependencies.scheduler,
			pull: dependencies.pull,
			writes: () => writes.submit(),
			failed: () => writes.notify()
		},
		executionState,
		new SyncSchedulingService()
	);
	const writes: MutationQueueController<C, T> & SubmissionLane = new MutationSubmission(
		accountId,
		dependencies,
		queueState,
		execution,
		new OutboxEditingService(),
		new OutboxDeliveryService()
	);
	return { writes, execution };
};
