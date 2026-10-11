import type { SyncCursor, SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceJournalPage } from '$lib/models/workspace-sync-reads';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { SyncChangesRepository } from '$lib/server/repositories/workspace/sync-changes';
import type { SyncObjectRepository } from '$lib/server/repositories/workspace/sync-objects';

export interface WorkspaceJournalReader {
	selectPage(since: SyncCursor): Promise<WorkspaceJournalPage>;
}

export interface WorkspaceResourceVersionReader {
	readVersion(
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag
	): Promise<Extract<SyncObjectRead<WorkspaceRecord>, { kind: 'found' }>>;
}

/** One workspace resource as the client syncs it, answered as unchanged when the ETag still holds. */
export interface SyncObjectReader {
	read(
		identity: WorkspaceResourceIdentity,
		etag: SyncEtag | null
	): Promise<SyncObjectRead<WorkspaceRecord>>;
}

/** Everything the workspace pull needs to read: the journal page and each resource it names. */
export interface WorkspaceSyncReader
	extends WorkspaceJournalReader, WorkspaceResourceVersionReader, SyncObjectReader {}

export class WorkspaceSyncReads implements WorkspaceSyncReader {
	constructor(
		private readonly changes: SyncChangesRepository,
		private readonly objects: SyncObjectRepository
	) {}

	async selectPage(since: SyncCursor): Promise<WorkspaceJournalPage> {
		const selection = await this.changes.readSelection(since);
		if (BigInt(since) > BigInt(selection.head))
			throw new Error('The client cursor is ahead of this account');
		return {
			cursor: selection.hasMore ? selection.checkpoint : selection.head,
			hasMore: selection.hasMore,
			changes: selection.changes
		};
	}

	async readVersion(identity: WorkspaceResourceIdentity, etag: SyncEtag) {
		const resource = await this.objects.read(identity, null);
		if (resource.kind !== 'found' || resource.snapshot.etag !== etag)
			throw new Error('The synchronization journal does not match its resource');
		return resource;
	}

	read(identity: WorkspaceResourceIdentity, etag: SyncEtag | null) {
		return this.objects.read(identity, etag);
	}
}
