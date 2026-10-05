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
	const indicator = syncIndicator({ ...synced, online: false, pending: 2 });
	expect({
		kind: indicator.kind,
		badge: indicator.badge,
		description: indicator.description
	}).toEqual({
		kind: 'offline',
		badge: 2,
		description: "2 changes will sync when you're back online."
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
