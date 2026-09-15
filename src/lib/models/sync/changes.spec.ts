import { expect, it } from 'vitest';
import { receiveResource, resourceStateSchema, syncEtag } from './index';
import { z } from 'zod';
const first = { etag: syncEtag(1n), value: 'Original' };
it('ignores a response older than a retained version', () => {
	const newest = receiveResource(undefined, { etag: syncEtag(3n), value: 'Newest' });
	expect(receiveResource(newest, first)).toEqual(newest);
});
it('does not resurrect a deleted resource from a delayed read', () => {
	const deleted = { kind: 'deleted' as const, etag: syncEtag(2n) };
	expect(receiveResource(deleted, first)).toEqual(deleted);
});
it('does not delete a resource from an older tombstone', () => {
	const newest = receiveResource(undefined, { etag: syncEtag(3n), value: 'Recreated' });
	expect(receiveResource(newest, { kind: 'deleted', etag: syncEtag(2n) })).toEqual(newest);
});
it('accepts a recreated resource after its tombstone', () => {
	expect(
		receiveResource(
			{ kind: 'deleted', etag: syncEtag(2n) },
			{ etag: syncEtag(3n), value: 'Recreated' }
		)
	).toEqual({ kind: 'present', snapshot: { etag: syncEtag(3n), value: 'Recreated' } });
});
it('compares versions beyond JavaScript integer precision', () => {
	const old = receiveResource(undefined, { etag: syncEtag(9007199254740992n), value: 'Old' });
	expect(receiveResource(old, { etag: syncEtag(9007199254740993n), value: 'New' })).toEqual({
		kind: 'present',
		snapshot: { etag: syncEtag(9007199254740993n), value: 'New' }
	});
});
it('rejects a persisted version without its complete body', () => {
	expect(
		resourceStateSchema(z.string()).safeParse({ kind: 'present', snapshot: { etag: syncEtag(1n) } })
			.success
	).toBe(false);
});
