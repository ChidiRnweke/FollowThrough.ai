import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import { ResourceCache } from './resource-cache';

const setup = () => {
	const repository = new InMemorySyncCache<string>();
	const transport = new InMemorySyncTransport<string>();
	const cache = new ResourceCache('user-a', { repository, transport });
	return { repository, transport, cache };
};
const first = { etag: syncEtag(1n), value: 'First copy' };
const second = { etag: syncEtag(2n), value: 'Second copy' };

describe('generic resource cache', () => {
	it('uses a newer body already persisted by another tab instead of downloading it again', async () => {
		const { repository, transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		await cache.warm();
		const other = new ResourceCache('user-a', { repository, transport });
		await other.initialize();
		transport.records.set('note:1', second);
		await cache.refresh();
		await cache.warm();
		await other.refresh();
		await other.warm();
		expect({ opened: await other.open('note:1'), bodies: transport.deliveredBodies }).toEqual({
			opened: { kind: 'ready', value: 'Second copy' },
			bodies: ['note:1', 'note:1']
		});
	});
	it('does not claim a workspace is available before learning its change batch', () => {
		expect(setup().cache.availability).toBe('unknown');
	});

	it('reports incomplete warming until all inventoried content is stored', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		expect(cache.availability).toBe('partial');
	});

	it('recognizes a successfully checked empty workspace as complete', async () => {
		const { cache } = setup();
		await cache.refresh();
		expect(cache.availability).toBe('complete');
	});

	it('reports complete warming after all inventoried content is stored', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		await cache.warm();
		expect(cache.availability).toBe('complete');
	});
	it('downloads current content initially and no bodies on unchanged synchronization', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		await cache.warm();
		await cache.refresh();
		await cache.warm();
		expect(transport.deliveredBodies).toEqual(['note:1']);
	});

	it('opens a warmed but previously unvisited record offline after reload', async () => {
		const { repository, transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		await cache.warm();
		const reopened = new ResourceCache('user-a', { repository, transport });
		reopened.setOnline(false);
		expect(await reopened.open('note:1')).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('retains saved content when the change batch request fails', async () => {
		const { transport, cache } = setup();
		await cache.accept('note:1', first);
		transport.pullFailure = 'Server unavailable';
		await cache.refresh();
		expect(cache.access('note:1')).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('removes a record only after receiving the complete authoritative change batch', async () => {
		const { cache, transport } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		await cache.warm();
		transport.records.delete('note:1');
		await cache.refresh();
		cache.setOnline(false);
		expect(cache.access('note:1')).toEqual({ kind: 'deleted' });
	});

	it('shares a background download with foreground demand', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', second);
		await cache.accept('note:1', first);
		await cache.refresh();
		const gate = transport.pause('note:1');
		const warming = cache.warm();
		await gate.started;
		const opened = cache.open('note:1');
		gate.release();
		await Promise.all([warming, opened]);
		expect(transport.deliveredBodies).toEqual(['note:1']);
	});

	it('lets foreground demand bypass a different background download', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		transport.records.set('note:2', second);
		await cache.refresh();
		const gate = transport.pause('note:1');
		const warming = cache.warm();
		await gate.started;
		const opened = await cache.open('note:2');
		gate.release();
		await warming;
		expect(opened).toEqual({ kind: 'ready', value: 'Second copy' });
	});

	it('keeps an updating object behind the read barrier until its live value arrives', async () => {
		const { transport, cache } = setup();
		await cache.accept('note:1', first);
		transport.records.set('note:1', second);
		await cache.refresh();
		const gate = transport.pause('note:1');
		const warming = cache.warm();
		await gate.started;
		const during = cache.access('note:1');
		const opened = cache.open('note:1');
		gate.release();
		await warming;
		expect({ during, after: await opened }).toEqual({
			during: { kind: 'wait' },
			after: { kind: 'ready', value: 'Second copy' }
		});
	});

	it('allows the retained copy offline while a background refresh is in flight', async () => {
		const { transport, cache } = setup();
		await cache.accept('note:1', first);
		transport.records.set('note:1', second);
		await cache.refresh();
		const gate = transport.pause('note:1');
		const warming = cache.warm();
		await gate.started;
		cache.setOnline(false);
		const opened = await cache.open('note:1');
		gate.release();
		await warming;
		expect(opened).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('does not replace an accepted mutation with a late read response', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		const gate = transport.pause('note:1');
		const opened = cache.open('note:1');
		await gate.started;
		await cache.accept('note:1', second);
		gate.release();
		expect(await opened).toEqual({ kind: 'ready', value: 'Second copy' });
	});

	it('rechecks a change batch that predates an accepted creation', async () => {
		const { transport, cache } = setup();
		const gate = transport.pause('changes');
		const refreshing = cache.refresh();
		await gate.started;
		transport.records.set('note:1', first);
		await cache.accept('note:1', first);
		gate.release();
		await refreshing;
		expect(cache.access('note:1')).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('does not expose another account’s persisted records', async () => {
		const { repository, transport, cache } = setup();
		await cache.accept('note:1', first);
		const other = new ResourceCache('user-b', { repository, transport });
		other.setOnline(false);
		expect(await other.open('note:1')).toEqual({ kind: 'unavailable' });
	});

	it('does not restore private data when a request finishes after logout', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		const gate = transport.pause('note:1');
		const opened = cache.open('note:1');
		await gate.started;
		cache.stop();
		gate.release();
		expect(await opened).toEqual({ kind: 'unavailable' });
	});

	it('reports a live missing record as unavailable', async () => {
		const { cache } = setup();
		expect(await cache.open('missing')).toEqual({ kind: 'unavailable' });
	});

	it('releases a waiting reader to its previous copy when connectivity is lost', async () => {
		const { cache, transport } = setup();
		await cache.accept('note:1', first);
		transport.records.set('note:1', second);
		await cache.refresh();
		const gate = transport.pause('note:1');
		const opened = cache.open('note:1');
		await gate.started;
		cache.setOnline(false);
		try {
			expect(await opened).toEqual({ kind: 'ready', value: 'First copy' });
		} finally {
			gate.release();
		}
	});

	it('allows a later foreground read to retry a failed refresh', async () => {
		const { cache, transport } = setup();
		await cache.accept('note:1', first);
		transport.records.set('note:1', second);
		await cache.refresh();
		transport.readFailure = 'Temporary network failure';
		await cache.warm();
		transport.readFailure = null;
		expect(await cache.open('note:1')).toEqual({ kind: 'ready', value: 'Second copy' });
	});

	it('preserves a deletion after reload instead of treating it as an offline cache miss', async () => {
		const { cache, repository, transport } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		transport.records.delete('note:1');
		await cache.refresh();
		const reopened = new ResourceCache('user-a', { repository, transport });
		reopened.setOnline(false);
		expect(await reopened.open('note:1')).toEqual({ kind: 'deleted' });
	});

	it('does not let a late download resurrect a journal tombstone', async () => {
		const { cache, transport } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		const gate = transport.pause('note:1');
		const opened = cache.open('note:1');
		await gate.started;
		transport.records.delete('note:1');
		await cache.refresh();
		gate.release();
		expect(await opened).toEqual({ kind: 'deleted' });
	});

	it('does not advance a durable cursor when saving its change batch fails', async () => {
		const { cache, repository, transport } = setup();
		transport.records.set('note:1', first);
		repository.writeFailure = 'Storage full';
		await cache.refresh();
		repository.writeFailure = null;
		await cache.refresh();
		await cache.warm();
		expect(await cache.open('note:1')).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('does not claim that a downloaded record was stored when persistence fails', async () => {
		const { repository, transport, cache } = setup();
		transport.records.set('note:1', first);
		repository.writeFailure = 'Storage full';
		expect(await cache.open('note:1')).toEqual({ kind: 'failure', message: 'Storage full' });
	});
});
