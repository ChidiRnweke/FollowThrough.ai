import { syncEtag } from '$lib/models/sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const identity = new WorkspaceCommandRulesService();
import type { Database } from '$lib/server/db';
import {
	WorkspaceSyncChanges,
	type SyncChangesRepository
} from '$lib/server/repositories/workspace/sync-changes';
import {
	WorkspaceSyncObjects,
	type SyncObjectRepository
} from '$lib/server/repositories/workspace/sync-objects';
import { WorkspaceSyncReceipts } from '$lib/server/repositories/workspace/sync-receipts';
import {
	WorkspaceMutationReceipts,
	type WorkspaceMutationGuard,
	type WorkspaceWriteRecoveryService
} from '$lib/server/services/workspace/mutation-receipts';

export interface SyncCapability {
	readonly changes: SyncChangesRepository;
	readonly objects: SyncObjectRepository;
	readonly mutationRetry: 'database-only' | 'never';
	readonly mutations: WorkspaceMutationGuard & WorkspaceWriteRecoveryService;
}
export const createSyncCapability = ({
	db,
	deferEmbedding = false
}: {
	readonly db: Database;
	readonly deferEmbedding?: boolean;
}): SyncCapability => {
	const objects = new WorkspaceSyncObjects(db);
	return {
		changes: new WorkspaceSyncChanges(db, identity.workspaceResourceKey, syncEtag),
		objects,
		mutationRetry: deferEmbedding ? ('database-only' as const) : ('never' as const),
		mutations: new WorkspaceMutationReceipts({
			syncObjects: objects,
			mutationReceipts: new WorkspaceSyncReceipts(db)
		})
	};
};
