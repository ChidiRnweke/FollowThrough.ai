import { describe, expect, it } from 'vitest';
import {
	accessCache,
	syncEtag,
	receiveResource,
	mergeResourceStates,
	type ResourceState
} from './index';

const snapshot = { etag: syncEtag(1n), value: 'Saved note' };
const cached = receiveResource(undefined, snapshot);
const updating = () =>
	mergeResourceStates(cached, { kind: 'present', etag: syncEtag(2n), body: null });

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
		expect(accessCache({ kind: 'requested' }, false)).toEqual({ kind: 'unavailable' });
	});
	it('reports an online refresh failure rather than calling the old copy current', () => {
		expect(
			accessCache(updating(), true, { kind: 'failed', message: 'Server unavailable' })
		).toEqual({ kind: 'failure', message: 'Server unavailable' });
	});
	it('retains offline access after a refresh failed', () => {
		expect(accessCache(updating(), false, { kind: 'failed', message: 'Connection lost' })).toEqual({
			kind: 'ready',
			value: 'Saved note'
		});
	});
});

describe('version races', () => {
	it('does not replace a newer cached copy with an older response', () => {
		const newer = receiveResource(cached, { etag: syncEtag(3n), value: 'Newer note' });
		expect(receiveResource(newer, snapshot)).toEqual(newer);
	});
	it('keeps updating when a response predates the latest inventory version', () => {
		const latest = mergeResourceStates(updating(), {
			kind: 'present',
			etag: syncEtag(3n),
			body: null
		});
		const received = receiveResource(latest, { etag: syncEtag(2n), value: 'Intermediate note' });
		expect(accessCache(received, true)).toEqual({ kind: 'wait' });
	});
	it('accepts a response newer than the inventory that scheduled it', () => {
		expect(
			accessCache(receiveResource(updating(), { etag: syncEtag(3n), value: 'Latest note' }), true)
		).toEqual({ kind: 'ready', value: 'Latest note' });
	});
	it('ignores older inventory observations', () => {
		expect(
			mergeResourceStates(updating(), { kind: 'present', etag: syncEtag(1n), body: null })
		).toEqual(updating());
	});
	it('compares versions without losing integer precision', () => {
		const large: ResourceState<string> = receiveResource(undefined, {
			etag: syncEtag(9007199254740992n),
			value: 'Earlier'
		});
		expect(
			accessCache(
				mergeResourceStates(large, {
					kind: 'present',
					etag: syncEtag(9007199254740993n),
					body: null
				}),
				true
			)
		).toEqual({ kind: 'wait' });
	});
});
