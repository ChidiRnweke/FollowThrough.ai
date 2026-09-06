import type { ActorContext } from '$lib/models/identity';
import type { SyncChanges, SyncCursor, SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
export type { SyncReceiptRepository as SyncReceiptWriter } from '$lib/server/repositories/workspace/sync-receipts';

export interface SyncChangeReader {
	pull(actor: ActorContext, since: SyncCursor): Promise<SyncChanges>;
}

export interface SyncObjectReader {
	read(
		actor: ActorContext,
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>>;
}
