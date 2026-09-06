import type { ActorContext } from '$lib/models/identity';
import type { SyncChanges, SyncCursor, SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';

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
