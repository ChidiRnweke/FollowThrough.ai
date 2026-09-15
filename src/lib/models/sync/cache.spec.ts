import { describe, expect, it } from 'vitest';
import { accessCache, receiveResource, syncEtag } from './index';
const original = receiveResource(undefined, { etag: syncEtag(1n), value: 'Saved note' });
describe('opening retained content', () => {
	it('opens cached content online without an inventory barrier', () => {
		expect(accessCache(original, true)).toEqual({ kind: 'ready', value: 'Saved note' });
	});
	it('keeps cached content accessible after a refresh failure', () => {
		expect(accessCache(original, true, { kind: 'failed', message: 'Server unavailable' })).toEqual({
			kind: 'ready',
			value: 'Saved note'
		});
	});
	it('opens the same cached content offline', () => {
		expect(accessCache(original, false)).toEqual({ kind: 'ready', value: 'Saved note' });
	});
	it('does not invent content for an offline cache miss', () => {
		expect(accessCache(undefined, false)).toEqual({ kind: 'unavailable' });
	});
	it('reports failure when an uncached record could not be read', () => {
		expect(accessCache(undefined, true, { kind: 'failed', message: 'Server unavailable' })).toEqual(
			{ kind: 'failure', message: 'Server unavailable' }
		);
	});
});
