import { describe, expect, it } from 'vitest';
import { applyResourceChanges, receiveResource, syncEtag, type ResourceState } from './index';

const present: ResourceState<string> = {
	kind: 'present',
	cache: {
		kind: 'cached',
		snapshot: { etag: syncEtag(1n), value: 'Saved' }
	}
};

describe('applying compact resource changes', () => {
	it('does not let a late deletion erase a newer recreation', () => {
		const newer = receiveResource(present, { etag: syncEtag(3n), value: 'Recreated' });
		expect(
			applyResourceChanges(new Map([['note:1', newer]]), [
				{ kind: 'delete', key: 'note:1', etag: syncEtag(2n) }
			]).get('note:1')
		).toEqual(newer);
	});

	it('does not let an earlier upsert resurrect a deleted version', () => {
		const deleted: ResourceState<string> = { kind: 'deleted', etag: syncEtag(2n) };
		expect(
			applyResourceChanges(new Map([['note:1', deleted]]), [
				{ kind: 'upsert', key: 'note:1', etag: syncEtag(2n) }
			]).get('note:1')
		).toEqual(deleted);
	});

	it('does not let a body received after deletion restore the deleted version', () => {
		const deleted: ResourceState<string> = { kind: 'deleted', etag: syncEtag(2n) };
		expect(receiveResource(deleted, { etag: syncEtag(2n), value: 'Deleted copy' })).toEqual(
			deleted
		);
	});
	it('preserves a cached resource absent from the change batch', () => {
		const current = new Map([['note:1', present]]);
		expect(applyResourceChanges(current, [])).toEqual(current);
	});

	it('does not invalidate a resource whose tag matches an upsert', () => {
		expect(
			applyResourceChanges(new Map([['note:1', present]]), [
				{ kind: 'upsert', key: 'note:1', etag: syncEtag(1n) }
			]).get('note:1')
		).toEqual(present);
	});

	it('invalidates only the changed task and leaves its unchanged note cached', () => {
		const next = applyResourceChanges(
			new Map([
				['note:1', present],
				['todo:1', present]
			]),
			[{ kind: 'upsert', key: 'todo:1', etag: syncEtag(2n) }]
		);
		expect(
			[...next]
				.filter(([, state]) => state.kind === 'present' && state.cache.kind === 'updating')
				.map(([key]) => key)
		).toEqual(['todo:1']);
	});

	it('records deletion even for an object this device never downloaded', () => {
		expect(
			applyResourceChanges(new Map(), [{ kind: 'delete', key: 'note:1', etag: syncEtag(1n) }]).get(
				'note:1'
			)
		).toEqual({ kind: 'deleted', etag: syncEtag(1n) });
	});

	it('makes a recreated identity fetchable without restoring its deleted old content', () => {
		const deleted: ResourceState<string> = { kind: 'deleted', etag: syncEtag(1n) };
		expect(
			applyResourceChanges(new Map([['note:1', deleted]]), [
				{ kind: 'upsert', key: 'note:1', etag: syncEtag(2n) }
			]).get('note:1')
		).toEqual({
			kind: 'present',
			cache: {
				kind: 'updating',
				previous: null,
				target: syncEtag(2n),
				transfer: { kind: 'queued' }
			}
		});
	});
});
