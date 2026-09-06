import type { Database } from '$lib/server/db';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
import { WorkspaceSyncObjects } from '$lib/server/repositories/workspace/sync-objects';

export const createSyncCapability = ({ db }: { readonly db: Database }) => ({
	changes: new WorkspaceSyncChanges(db),
	objects: new WorkspaceSyncObjects(db)
});
