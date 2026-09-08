import { describe, expect, it } from 'vitest';
import { accessCache, syncEtag, transitionCache, type CacheEntry } from './index';

const cached: CacheEntry<string> = {
	kind: 'cached',
	snapshot: { etag: syncEtag(1n), value: 'Saved note' }
};
const updating = () => transitionCache(cached, { kind: 'observe', etag: syncEtag(2n) });

describe('opening cached content', () => {
	it('opens cached content online without waiting for inventory validation', () => {
		expect(accessCache(cached, true)).toEqual({ kind: 'ready', value: 'Saved note' });
	});

	it('waits online for content known to have changed', () => {
		expect(accessCache(updating(), true)).toEqual({ kind: 'wait' });
	});

	it('opens the previous copy of updating content offline', () => {
		expect(accessCache(updating(), false)).toEqual({ kind: 'ready', value: 'Saved note' });
	});

	it('does not invent content for an offline cache miss', () => {
		expect(accessCache({ kind: 'uncached' }, false)).toEqual({ kind: 'unavailable' });
	});

	it('reports an online refresh failure rather than calling the old copy current', () => {
		const failed = transitionCache(updating(), { kind: 'failure', message: 'Server unavailable' });
		expect(accessCache(failed, true)).toEqual({ kind: 'failure', message: 'Server unavailable' });
	});

	it('retains offline access after a refresh failed', () => {
		const failed = transitionCache(updating(), { kind: 'failure', message: 'Connection lost' });
		expect(accessCache(failed, false)).toEqual({ kind: 'ready', value: 'Saved note' });
	});
});

describe('version races', () => {
	it('does not replace a newer cached copy with an older response', () => {
		const newer = transitionCache(cached, {
			kind: 'receive',
			snapshot: { etag: syncEtag(3n), value: 'Newer note' }
		});
		expect(transitionCache(newer, { kind: 'receive', snapshot: cached.snapshot })).toEqual(newer);
	});

	it('keeps updating when a response predates the latest inventory version', () => {
		const latest = transitionCache(updating(), { kind: 'observe', etag: syncEtag(3n) });
		const received = transitionCache(latest, {
			kind: 'receive',
			snapshot: { etag: syncEtag(2n), value: 'Intermediate note' }
		});
		expect(accessCache(received, true)).toEqual({ kind: 'wait' });
	});

	it('accepts a response newer than the inventory that scheduled it', () => {
		expect(
			transitionCache(updating(), {
				kind: 'receive',
				snapshot: { etag: syncEtag(3n), value: 'Latest note' }
			})
		).toEqual({ kind: 'cached', snapshot: { etag: syncEtag(3n), value: 'Latest note' } });
	});

	it('ignores older inventory observations', () => {
		expect(transitionCache(updating(), { kind: 'observe', etag: syncEtag(1n) })).toEqual(
			updating()
		);
	});

	it('compares versions without losing integer precision', () => {
		const large: CacheEntry<string> = {
			kind: 'cached',
			snapshot: { etag: syncEtag(9007199254740992n), value: 'Earlier' }
		};
		expect(
			accessCache(
				transitionCache(large, {
					kind: 'observe',
					etag: syncEtag(9007199254740993n)
				}),
				true
			)
		).toEqual({ kind: 'wait' });
	});
});
