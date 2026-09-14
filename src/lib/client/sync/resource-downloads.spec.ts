import { expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import { ResourceCache } from './resource-cache';

const setup = () => {
	const repository = new InMemorySyncCache<string>();
	const transport = new InMemorySyncTransport<string>();
	const cache = new ResourceCache('account', { repository, transport });
	return { repository, transport, cache };
};
const first = { etag: syncEtag(1n), value: 'Original' };
const next = { etag: syncEtag(2n), value: 'Updated' };

it('opens an uncached record without waiting for the inventory download', async () => {
	const { transport, cache } = setup();
	transport.records.set('note', first);
	const paused = transport.pause('changes');
	const pulling = cache.refresh();
	await paused.started;
	const result = await cache.open('note');
	paused.release();
	await pulling;
	expect(result).toEqual({ kind: 'ready', value: first.value });
});
it('targeted reads do not establish inventory completeness', async () => {
	const { repository, transport, cache } = setup();
	transport.records.set('note', first);
	await cache.open('note');
	expect(await repository.load('account')).toMatchObject({
		cursor: null,
		inventoryComplete: false
	});
});
it('an older targeted response does not replace a newer committed version', async () => {
	const { transport, cache } = setup();
	transport.records.set('note', first);
	const paused = transport.pause('note');
	const opening = cache.open('note');
	await paused.started;
	await cache.accept('note', next);
	paused.release();
	expect(await opening).toEqual({ kind: 'ready', value: next.value });
});
it('distinguishes a missing server record from a failed targeted read', async () => {
	const { cache } = setup();
	expect(await cache.open('absent')).toEqual({ kind: 'unavailable' });
});
it('reports a targeted transport failure', async () => {
	const { transport, cache } = setup();
	transport.readFailure = 'Disconnected';
	expect(await cache.open('note')).toEqual({ kind: 'failure', message: 'Disconnected' });
});
it('keeps offline unknown records unavailable without a network request', async () => {
	const { transport, cache } = setup();
	transport.readFailure = 'Network must not be used';
	cache.setOnline(false);
	expect(await cache.open('note')).toEqual({ kind: 'unavailable' });
});
it('follows page checkpoints until every body has been stored', async () => {
	const { transport, cache } = setup();
	transport.pageSize = 2;
	for (let i = 0; i < 7; i++)
		transport.records.set(`note:${i}`, { etag: syncEtag(BigInt(i + 1)), value: `Note ${i}` });
	await cache.refresh();
	expect({ records: cache.records.size, availability: cache.availability }).toEqual({
		records: 7,
		availability: 'complete'
	});
});
