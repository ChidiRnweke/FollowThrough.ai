import { expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
it('preserves a database version above the JavaScript integer range', () => {
	expect(syncEtag(9007199254740993n)).toBe('sync-v1-9007199254740993');
});
it.each([0n, -1n])('rejects a nonpositive synchronization version %s', (version) => {
	expect(() => syncEtag(version)).toThrow('must be positive');
});
