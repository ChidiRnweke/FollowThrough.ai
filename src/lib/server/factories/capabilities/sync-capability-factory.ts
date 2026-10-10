import {
	WorkspaceJournal,
	type WorkspaceJournalReader
} from '$lib/server/services/workspace/journal';
import {
	WorkspaceResourceVersions,
	type WorkspaceResourceVersionReader
} from '$lib/server/services/workspace/resource-versions';
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
	readonly changes: WorkspaceJournalReader;
	readonly resourceVersions: WorkspaceResourceVersionReader;
	readonly resourceKeys: WorkspaceCommandRules;
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
		changes: new WorkspaceJournal(new WorkspaceSyncChanges(db)),
		resourceVersions: new WorkspaceResourceVersions(objects),
		resourceKeys: new WorkspaceCommandRulesService(),
		objects,
		mutationRetry: deferEmbedding ? ('database-only' as const) : ('never' as const),
		mutations: new WorkspaceMutationReceipts({
			syncObjects: objects,
			mutationReceipts: new WorkspaceSyncReceipts(db)
		})
	};
};
