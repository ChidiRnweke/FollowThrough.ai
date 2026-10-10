import {
	initialSyncCursor,
	syncCursorSchema,
	syncEtag,
	type ResourceState
} from '$lib/models/sync';
import { expect, it } from 'vitest';
import { CacheCommitService } from './state';

it('keeps a newer acknowledged record and checkpoint when an older page arrives', () => {
	const current: ResourceState<string> = {
		kind: 'present',
		snapshot: { etag: syncEtag(3n), value: 'acknowledged' }
	};
	expect(
		new CacheCommitService().decide(
			new Map([['note', current]]),
			{ cursor: syncCursorSchema.parse('3'), inventoryComplete: true },
			{
				put: [
					{
						key: 'note',
						entry: { kind: 'present', snapshot: { etag: syncEtag(2n), value: 'old page' } }
					}
				],
				remove: [],
				cursor: initialSyncCursor,
				inventoryComplete: false
			}
		)
	).toEqual({ put: [{ key: 'note', entry: current }], remove: [], checkpoint: null });
});
it('refuses a commit that both replaces and removes one resource', () => {
	expect(() =>
		new CacheCommitService().decide(new Map(), null, {
			put: [{ key: 'note', entry: { kind: 'deleted', etag: syncEtag(1n) } }],
			remove: [{ key: 'note', etag: syncEtag(1n) }]
		})
	).toThrow('A cache commit must touch each resource only once');
});
