import { expect, it } from 'vitest';
import { type SyncIndicatorInput } from '$lib/models/sync';
import { syncIndicator } from '$lib/services/sync/indicator';
const synced: SyncIndicatorInput = {
	online: true,
	pending: 0,
	sending: false,
	review: 0,
	failedDownloads: 0,
	downloading: false,
	failure: null
};
it('shows offline pending changes without hiding their durable status', () => {
	expect(syncIndicator({ ...synced, online: false, pending: 2 })).toMatchObject({
		kind: 'offline',
		badge: 2
	});
});
it('keeps incomplete downloads visible after a successful journal pull', () => {
	expect(syncIndicator({ ...synced, failedDownloads: 1 }).kind).toBe('attention');
});
it('does not add a badge during an ordinary online save', () => {
	expect(syncIndicator({ ...synced, pending: 1 })).toMatchObject({ kind: 'saving', badge: 0 });
});
it('names a single decision in the singular', () => {
	expect(syncIndicator({ ...synced, review: 1 }).headline).toBe('1 change needs a decision');
});
it('describes offline pending work with its actual count', () => {
	expect(syncIndicator({ ...synced, online: false, pending: 2 }).description).toBe(
		"2 changes will sync when you're back online."
	);
});
