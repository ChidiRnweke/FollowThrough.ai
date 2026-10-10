import type { SyncEtag } from '$lib/models/sync';

/** Database sequence values are transported without JavaScript number rounding. */
export const syncEtag = (version: bigint): SyncEtag => {
	if (version <= 0n) throw new Error('A synchronization version must be positive');
	return `sync-v1-${version}` as SyncEtag;
};
