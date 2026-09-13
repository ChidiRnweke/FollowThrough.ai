import type { WorkspaceWriteCancellation } from '$lib/models/workspace-mutations';
import type { ActorContext } from '$lib/models/identity';
import type { SyncChanges, SyncCursor, SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { SyncChangePage } from '$lib/models/sync';
import type { WorkspaceWriteRecovery } from '$lib/models/workspace-mutations';

export interface SyncWriteRecovery {
	cancel(actor: ActorContext, input: WorkspaceWriteCancellation): Promise<WorkspaceWriteRecovery>;
	acknowledge(actor: ActorContext, operationId: string): Promise<void>;
}
export type { SyncReceiptRepository as SyncReceiptWriter } from '$lib/server/repositories/workspace/sync-receipts';

export interface SyncChangeReader {
	pull(actor: ActorContext, since: SyncCursor): Promise<SyncChanges>;
	pullPage(actor: ActorContext, since: SyncCursor): Promise<SyncChangePage>;
}

export interface SyncObjectReader {
	readMany(
		actor: ActorContext,
		requests: readonly { identity: WorkspaceResourceIdentity; etag: SyncEtag | null }[]
	): Promise<
		readonly {
			key: string;
			result: SyncObjectRead<WorkspaceRecord> | { kind: 'failure'; message: string };
		}[]
	>;
	read(
		actor: ActorContext,
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>>;
}
