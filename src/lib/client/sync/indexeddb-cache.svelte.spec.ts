import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { syncEtag, type CacheEntry } from '$lib/models/sync';
import { IndexedDbSyncCache } from './indexeddb-cache';

const databases: string[] = [];
const openRepositories: IndexedDbSyncCache<string>[] = [];
const setup = (name = `workspace-sync-test-${crypto.randomUUID()}`) => {
	if (!databases.includes(name)) databases.push(name);
	const repository = new IndexedDbSyncCache(z.string(), name);
	openRepositories.push(repository);
	return { name, repository };
};

const entry: CacheEntry<string> = {
	kind: 'cached',
	snapshot: { etag: syncEtag(1n), value: 'My note' }
};

afterEach(async () => {
	for (const repository of openRepositories.splice(0)) await repository.close();
	for (const name of databases.splice(0))
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(name);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error ?? new Error('Could not delete test storage'));
			request.onblocked = () => reject(new Error('Test storage remains open'));
		});
});

describe('durable workspace cache', () => {
	it('distinguishes an unknown inventory from a confirmed empty workspace', async () => {
		const { repository } = setup();
		expect(await repository.load('user-a')).toEqual({ records: [], inventory: null });
	});

	it('persists the complete inventory together with its cache entries', async () => {
		const { repository } = setup();
		const inventory = [{ key: 'note:1', etag: syncEtag(1n) }];
		await repository.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [], inventory });
		expect(await repository.load('user-a')).toEqual({
			records: [{ key: 'note:1', entry }],
			inventory
		});
	});

	it('retains cached content after reopening storage', async () => {
		const { name, repository } = setup();
		await repository.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [] });
		await repository.close();
		const reopened = setup(name).repository;
		expect((await reopened.load('user-a')).records).toEqual([{ key: 'note:1', entry }]);
	});

	it('isolates both content and inventory between accounts', async () => {
		const { repository } = setup();
		await repository.commit('user-a', {
			put: [{ key: 'note:1', entry }],
			remove: [],
			inventory: []
		});
		expect(await repository.load('user-b')).toEqual({ records: [], inventory: null });
	});

	it('deletes only the requested account’s record', async () => {
		const { repository } = setup();
		await repository.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [] });
		await repository.commit('user-b', { put: [{ key: 'note:1', entry }], remove: [] });
		await repository.commit('user-a', { put: [], remove: ['note:1'] });
		expect((await repository.load('user-b')).records).toEqual([{ key: 'note:1', entry }]);
	});

	it('reports incompatible persisted payloads instead of treating them as cache misses', async () => {
		const { name, repository } = setup();
		await repository.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [] });
		await repository.close();
		const incompatible = new IndexedDbSyncCache(z.number(), name);
		try {
			await expect(incompatible.load('user-a')).rejects.toThrow();
		} finally {
			await incompatible.close();
		}
	});
});
