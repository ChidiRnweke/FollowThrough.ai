import type { ActorContext } from '$lib/models/identity';
import type { SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { SyncObjectRepository } from '$lib/server/repositories/workspace/sync-objects';

export interface WorkspaceResourceVersionReader {
	readVersion(
		actor: ActorContext,
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag
	): Promise<Extract<SyncObjectRead<WorkspaceRecord>, { kind: 'found' }>>;
}

export class WorkspaceResourceVersions implements WorkspaceResourceVersionReader {
	constructor(private readonly repository: SyncObjectRepository) {}

	async readVersion(actor: ActorContext, identity: WorkspaceResourceIdentity, etag: SyncEtag) {
		const resource = await this.repository.read(actor, identity, null);
		if (resource.kind !== 'found' || resource.snapshot.etag !== etag)
			throw new Error('The synchronization journal does not match its resource');
		return resource;
	}
}
