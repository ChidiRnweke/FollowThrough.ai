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
