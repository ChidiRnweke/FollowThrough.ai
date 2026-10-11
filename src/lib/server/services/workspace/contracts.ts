import type { WorkspaceWriteCancellation } from '$lib/models/workspace-mutations';
import type { WorkspaceWriteRecovery } from '$lib/models/workspace-mutations';

export interface SyncWriteRecovery {
	cancel(input: WorkspaceWriteCancellation): Promise<WorkspaceWriteRecovery>;
}
export type { SyncReceiptRepository as SyncReceiptWriter } from '$lib/server/repositories/workspace/sync-receipts';
