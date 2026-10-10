import { CacheSynchronization } from './cache';
import { ResourceCacheStore } from '$lib/stores/sync/cache';
import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/services/sync/versions';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import { createResourceCache } from '$lib/factories/sync/cache';

const setup = () => {
	const repository = new InMemorySyncCache<string>();
	const transport = new InMemorySyncTransport<string>();
	const cache = createResourceCache('user-a', { repository, transport });
	return { repository, transport, cache };
};
const first = { etag: syncEtag(1n), value: 'First copy' };
const second = { etag: syncEtag(2n), value: 'Second copy' };

describe('complete resource replication', () => {
	it('does not claim complete inventory before synchronization', () => {
		expect(setup().cache.availability).toBe('unknown');
	});
	it('downloads bodies with the first page and none for an unchanged checkpoint', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		await cache.refresh();
		expect(transport.deliveredBodies).toEqual(['note:1']);
	});
	it('commits a complete inventory without a second download phase', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		expect(cache.availability).toBe('complete');
	});
	it('recognizes an empty server inventory as complete', async () => {
		const { cache } = setup();
		await cache.refresh();
		expect(cache.availability).toBe('complete');
	});
	it('opens a replicated record offline after a restart', async () => {
		const { repository, transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		const restarted = createResourceCache('user-a', { repository, transport });
		restarted.setOnline(false);
		const opened = await restarted.open('note:1');
		expect({ opened, accessed: restarted.access('note:1') }).toEqual({
			opened: { kind: 'ready', value: first.value },
			accessed: { kind: 'ready', value: first.value }
		});
	});
	it('opens cached content while a newer page is still downloading', async () => {
		const { transport, cache } = setup();
		await cache.accept('note:1', first);
		transport.records.set('note:1', second);
		const gate = transport.pause('changes');
		const pulling = cache.refresh();
		await gate.started;
		const opened = await cache.open('note:1');
		const accessed = cache.access('note:1');
		gate.release();
		await pulling;
		expect({ opened, accessed }).toEqual({
			opened: { kind: 'ready', value: first.value },
			accessed: { kind: 'ready', value: first.value }
		});
	});
	it('preserves cached content when synchronization fails', async () => {
		const { transport, cache } = setup();
		await cache.accept('note:1', first);
		transport.pullFailure = 'Disconnected';
		await cache.refresh();
		expect(cache.access('note:1')).toEqual({ kind: 'ready', value: first.value });
	});
	it('applies an authoritative tombstone', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		await cache.refresh();
		transport.records.delete('note:1');
		await cache.refresh();
		expect(cache.access('note:1')).toEqual({ kind: 'deleted' });
	});
	it('retains a newer accepted version when an older page arrives', async () => {
		const { transport, cache } = setup();
		transport.records.set('note:1', first);
		const gate = transport.pause('changes');
		const pulling = cache.refresh();
		await gate.started;
		await cache.accept('note:1', second);
		gate.release();
		await pulling;
		expect(cache.access('note:1')).toEqual({ kind: 'ready', value: second.value });
	});
	it('does not publish a page after account stop', async () => {
		const { repository, transport, cache } = setup();
		transport.records.set('note:1', first);
		const gate = transport.pause('changes');
		const pulling = cache.refresh();
		await gate.started;
		cache.stop();
		gate.release();
		await pulling;
		expect((await repository.load('user-a')).records).toEqual([]);
	});
	it('does not advance the checkpoint when page persistence fails', async () => {
		const { repository, transport, cache } = setup();
		transport.records.set('note:1', first);
		repository.writeFailure = 'Storage full';
		await cache.refresh();
		expect(await repository.load('user-a')).toMatchObject({ cursor: null, records: [] });
	});
	it('does not advance past a malformed server record', async () => {
		const { repository, transport, cache } = setup();
		transport.records.set('note:1', first);
		transport.failures.set('note:1', 'Unreadable record');
		await cache.refresh();
		expect(await repository.load('user-a')).toMatchObject({ cursor: null, records: [] });
	});
	it('remembers that the server has no such record until the next read', async () => {
		const { cache } = setup();
		await cache.open('note:1');
		expect(cache.access('note:1')).toEqual({ kind: 'unavailable' });
	});
});

it('does not retain a delayed targeted-read failure after account teardown', async () => {
	const repository = new InMemorySyncCache<string>();
	const transport = new InMemorySyncTransport<string>();
	const state = new ResourceCacheStore<string>();
	const cache = new CacheSynchronization('account', { repository, transport }, state);
	const gate = transport.pause('note');
	const opening = cache.open('note');
	await gate.started;
	const reading = state.fetching('note');
	cache.stop();
	transport.readFailure = 'Disconnected';
	gate.release();
	await reading;
	expect({
		opened: await opening,
		failures: cache.failedDownloads,
		records: cache.records.size,
		status: cache.status
	}).toEqual({
		opened: { kind: 'unavailable' },
		failures: 0,
		records: 0,
		status: { kind: 'stopped' }
	});
});
