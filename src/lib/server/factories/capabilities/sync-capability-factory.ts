import type { ActorContext } from '$lib/models/identity';
import {
	WorkspaceSyncReads,
	type WorkspaceSyncReader
} from '$lib/server/services/workspace/sync-reads';
import {
	WorkspaceCommandRulesService,
	type WorkspaceCommandRules
} from '$lib/services/workspace/commands';
import type { Database } from '$lib/server/db';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
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
	readonly reads: WorkspaceSyncReader;
	readonly resourceKeys: WorkspaceCommandRules;
	readonly objects: SyncObjectRepository;
	readonly mutationRetry: 'database-only' | 'never';
	readonly mutations: WorkspaceMutationGuard & WorkspaceWriteRecoveryService;
}
export const createSyncCapability = (
	actor: ActorContext,
	{
		db,
		deferEmbedding = false
	}: {
		readonly db: Database;
		readonly deferEmbedding?: boolean;
	}
): SyncCapability => {
	const objects = new WorkspaceSyncObjects(actor, db);
	return {
		reads: new WorkspaceSyncReads(new WorkspaceSyncChanges(actor, db), objects),
		resourceKeys: new WorkspaceCommandRulesService(),
		objects,
		mutationRetry: deferEmbedding ? ('database-only' as const) : ('never' as const),
		mutations: new WorkspaceMutationReceipts({
			syncObjects: objects,
			mutationReceipts: new WorkspaceSyncReceipts(actor, db)
		})
	};
};
