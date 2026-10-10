import { expect, it } from 'vitest';
import { syncEtag } from '$lib/services/sync/versions';
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
	const opened = await cache.open('absent');
	expect({ opened, accessed: cache.access('absent') }).toEqual({
		opened: { kind: 'unavailable' },
		accessed: { kind: 'unavailable' }
	});
});
it('reports a targeted transport failure', async () => {
	const { transport, cache } = setup();
	transport.readFailure = 'Disconnected';
	const opened = await cache.open('note');
	expect({ opened, accessed: cache.access('note') }).toEqual({
		opened: { kind: 'failure', message: 'Disconnected' },
		accessed: { kind: 'failure', message: 'Disconnected' }
	});
});
it('keeps offline unknown records unavailable without a network request', async () => {
	const { transport, cache } = setup();
	transport.readFailure = 'Network must not be used';
	cache.setOnline(false);
	const opened = await cache.open('note');
	expect({ opened, accessed: cache.access('note') }).toEqual({
		opened: { kind: 'unavailable' },
		accessed: { kind: 'unavailable' }
	});
});
it('follows page checkpoints until every body has been stored', async () => {
	const { transport, cache } = setup();
	transport.pageSize = 2;
	const expected = Array.from({ length: 7 }, (_, index) => ({
		key: `note:${index}`,
		etag: syncEtag(BigInt(index + 1)),
		value: `Note ${index}`
	}));
	for (const record of expected)
		transport.records.set(record.key, { etag: record.etag, value: record.value });
	await cache.refresh();
	expect({
		records: [...cache.records]
			.map(([key, entry]) => ({
				key,
				etag: entry.kind === 'present' ? entry.snapshot.etag : undefined,
				value: entry.kind === 'present' ? entry.snapshot.value : undefined
			}))
			.sort((a, b) => a.key.localeCompare(b.key)),
		availability: cache.availability
	}).toEqual({
		records: expected.sort((a, b) => a.key.localeCompare(b.key)),
		availability: 'complete'
	});
});
