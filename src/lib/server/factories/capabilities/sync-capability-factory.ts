import { syncEtag } from '$lib/services/sync/versions';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import type { Database } from '$lib/server/db';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';
import { WorkspaceSyncReceipts } from '$lib/server/repositories/workspace/sync-receipts';
import { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';

export const createSyncCapability = ({
	db,
	deferEmbedding = false
}: {
	readonly db: Database;
	readonly deferEmbedding?: boolean;
}) => {
	const objects = new WorkspaceSyncObjects(db);
	return {
		changes: new WorkspaceSyncChanges(db, workspaceResourceKey, syncEtag),
		objects,
		mutationRetry: deferEmbedding ? ('database-only' as const) : ('never' as const),
		mutations: new WorkspaceMutationReceipts({
			syncObjects: objects,
			mutationReceipts: new WorkspaceSyncReceipts(db, workspaceResourceKey)
		})
	};
};
