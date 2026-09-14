import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import {
	InMemorySyncCache,
	InMemoryBatchSyncTransport
} from '$lib/testing/sync/fakes/in-memory-sync';
import { ResourceCache } from './resource-cache';

const setup = () => {
	const repository = new InMemorySyncCache<string>();
	const transport = new InMemoryBatchSyncTransport<string>();
	const cache = new ResourceCache('account', { repository, transport });
	for (let index = 1; index <= 70; index++)
		transport.records.set(`note:${index}`, {
			etag: syncEtag(BigInt(index)),
			value: `Note ${index}`
		});
	return { repository, transport, cache };
};
describe('paged workspace downloads', () => {
	it('retains every record across inventory pages and body batches', async () => {
		const { cache, transport } = setup();
		transport.pageSize = 3;
		await cache.refresh();
		await cache.warm();
		expect({
			size: cache.records.size,
			availability: cache.availability,
			delivered: transport.deliveredBodies.length
		}).toEqual({ size: 70, availability: 'complete', delivered: 70 });
	});
	it('leaves an interrupted initial inventory unknown after reopening', async () => {
		const { cache, transport, repository } = setup();
		transport.pageSize = 3;
		const unsubscribe = cache.subscribe(() => {
			if (cache.records.size === 3) {
				unsubscribe();
				cache.setOnline(false);
			}
		});
		await cache.refresh();
		const reopened = new ResourceCache('account', { repository, transport });
		await reopened.initialize();
		expect(reopened.availability).toBe('unknown');
	});
	it('resumes an interrupted inventory from its durable checkpoint', async () => {
		const { cache, transport, repository } = setup();
		transport.pageSize = 3;
		const unsubscribe = cache.subscribe(() => {
			if (cache.records.size === 3) {
				unsubscribe();
				cache.setOnline(false);
			}
		});
		await cache.refresh();
		const reopened = new ResourceCache('account', { repository, transport });
		await reopened.refresh();
		await reopened.warm();
		expect({ size: reopened.records.size, availability: reopened.availability }).toEqual({
			size: 70,
			availability: 'complete'
		});
	});
	it('keeps successful bodies when another body in their batch fails', async () => {
		const { cache, transport } = setup();
		transport.failures.set('note:1', 'Unreadable body');
		await cache.refresh();
		await cache.warm();
		expect({
			failed: cache.failedDownloads,
			next: cache.access('note:2'),
			delivered: transport.deliveredBodies.length
		}).toEqual({ failed: 1, next: { kind: 'ready', value: 'Note 2' }, delivered: 69 });
	});
	it('does not download unchanged bodies on a subsequent paged refresh', async () => {
		const { cache, transport } = setup();
		transport.pageSize = 3;
		await cache.refresh();
		await cache.warm();
		await cache.refresh();
		await cache.warm();
		expect(transport.deliveredBodies.length).toBe(70);
	});
});

// SYNC-READ: a fixed announced target cannot cause an unbounded retry loop.
it.each(['foreground', 'background'] as const)(
	'ends a non-progressing %s read with a recoverable failure',
	async (lane) => {
		const repository = new InMemorySyncCache<string>();
		const transport = new InMemoryBatchSyncTransport<string>();
		transport.records.set('note:1', { etag: syncEtag(2n), value: 'Latest' });
		transport.readSnapshots.set('note:1', { etag: syncEtag(1n), value: 'Old' });
		transport.readBudget = 3;
		const cache = new ResourceCache('account', { repository, transport });
		await cache.refresh();
		if (lane === 'foreground') await cache.open('note:1');
		else await cache.warm();
		expect(cache.access('note:1')).toEqual({
			kind: 'failure',
			message: 'The latest copy could not be downloaded. Retry to check again.'
		});
	}
);

it('shares the body capacity between warming and concurrent collection preparation', async () => {
	const { cache, transport } = setup();
	transport.maxConcurrentReads = 32;
	await cache.refresh();
	const keys = [...transport.records.keys()];
	const paused = keys.slice(0, 32).map((key) => transport.pause(key));
	const warming = cache.warm();
	await Promise.all(paused.map((item) => item.started));
	const preparing = cache.prepare(keys.slice(32));
	// Yield one event-loop turn so both lanes reach the controllable transport.
	await new Promise((resolve) => setTimeout(resolve, 0));
	for (const item of paused) item.release();
	await Promise.all([warming, preparing]);
	expect(cache.availability).toBe('complete');
});

it('joins a foreground read to its already admitted background batch', async () => {
	const { cache, transport } = setup();
	await cache.refresh();
	const gate = transport.pause('note:1');
	const warming = cache.warm();
	await gate.started;
	const foreground = cache.open('note:2');
	gate.release();
	await Promise.all([warming, foreground]);
	expect(transport.batches.flat().filter((key) => key === 'note:2')).toEqual(['note:2']);
});

it('persists download admission without persisting the live network attempt', async () => {
	const repository = new InMemorySyncCache<string>();
	const transport = new InMemoryBatchSyncTransport<string>();
	transport.records.set('note:1', { etag: syncEtag(1n), value: 'First' });
	const cache = new ResourceCache('account', { repository, transport });
	const gate = transport.pause('note:1');
	const opening = cache.open('note:1');
	await gate.started;
	const stored = await repository.load('account');
	gate.release();
	await opening;
	expect(stored.records[0].entry).toEqual({ kind: 'requested' });
});

it('keeps download failure local while retaining a durable retry target', async () => {
	const { cache, transport, repository } = setup();
	await cache.refresh();
	transport.failures.set('note:1', 'Unreadable body');
	await cache.open('note:1');
	const stored = await repository.load('account');
	expect({
		local: cache.access('note:1'),
		durable: stored.records.find((row) => row.key === 'note:1')?.entry
	}).toEqual({
		local: { kind: 'failure', message: 'Unreadable body' },
		durable: { kind: 'present', etag: syncEtag(1n), body: null }
	});
});

it('does not replace this tab’s failed attempt with another tab’s queued projection', async () => {
	const { cache, transport, repository } = setup();
	await cache.refresh();
	transport.failures.set('note:1', 'Unreadable body');
	await cache.open('note:1');
	cache.applyStored(await repository.load('account'), false);
	expect(cache.access('note:1')).toEqual({ kind: 'failure', message: 'Unreadable body' });
});

it('reports a failed body transfer to the warming scheduler', async () => {
	const { cache, transport } = setup();
	await cache.refresh();
	transport.failures.set('note:1', 'Unreadable body');
	expect(await cache.warm()).toEqual({ kind: 'failure', message: 'Unreadable body' });
});

it('retries failed body targets on the next warming attempt without another journal pull', async () => {
	const { cache, transport } = setup();
	await cache.refresh();
	transport.failures.set('note:1', 'Unreadable body');
	await cache.warm();
	transport.failures.delete('note:1');
	await cache.warm();
	expect(cache.access('note:1')).toEqual({ kind: 'ready', value: 'Note 1' });
});

it('returns a failure when a stale response is followed by a transport failure', async () => {
	const repository = new InMemorySyncCache<string>();
	const transport = new InMemoryBatchSyncTransport<string>();
	transport.records.set('note:1', { etag: syncEtag(2n), value: 'Newest' });
	transport.readSnapshots.set('note:1', { etag: syncEtag(1n), value: 'Older' });
	transport.readBudget = 1;
	const cache = new ResourceCache('account', { repository, transport });
	await cache.refresh();
	expect(await cache.warm()).toEqual({
		kind: 'failure',
		message: 'Transport capacity exhausted without progress'
	});
});
