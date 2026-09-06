import type { Database } from '$lib/server/db';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';
import { WorkspaceSyncReceipts } from '$lib/server/repositories/workspace/sync-receipts';
import { SyncMutationTransactions } from '$lib/server/services/workspace/mutations';
import type { AtomicOperation } from '$lib/models/workspace';

export const createSyncCapability = ({
	db,
	transactionRunner
}: {
	readonly db: Database;
	readonly transactionRunner: AtomicOperation;
}) => {
	const objects = new WorkspaceSyncObjects(db);
	return {
		changes: new WorkspaceSyncChanges(db),
		objects,
		mutations: new SyncMutationTransactions({
			syncObjects: objects,
			mutationReceipts: new WorkspaceSyncReceipts(db),
			transactionRunner
		})
	};
};
