import type { SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { SyncObjectRepository } from '$lib/server/repositories/workspace/sync-objects';

/** One workspace resource as the client syncs it, answered as unchanged when the ETag still holds. */
export interface SyncObjectReader {
	read(
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>>;
}
export class SyncObjectService implements SyncObjectReader {
	constructor(private readonly repository: SyncObjectRepository) {}
	read(identity: WorkspaceResourceIdentity, etag: SyncEtag | null) {
		return this.repository.read(identity, etag);
	}
}
