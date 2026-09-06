import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { syncEtag, initialSyncCursor, type ResourceState } from '$lib/models/sync';
import { IndexedDbSyncCache } from './indexeddb-cache';

const databases: string[] = [];
const openRepositories: IndexedDbSyncCache<string>[] = [];
const setup = (name = `workspace-sync-test-${crypto.randomUUID()}`) => {
	if (!databases.includes(name)) databases.push(name);
	const repository = new IndexedDbSyncCache(z.string(), name);
	openRepositories.push(repository);
	return { name, repository };
};

const entry: ResourceState<string> = {
	kind: 'present',
	cache: {
		kind: 'cached',
		snapshot: { etag: syncEtag(1n), value: 'My note' }
	}
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
	it('retains the deletion and acknowledged cursor together after reopening storage', async () => {
		const { name, repository } = setup();
		await repository.commit('user-a', {
			put: [{ key: 'note:1', entry: { kind: 'deleted' } }],
			remove: [],
			cursor: initialSyncCursor
		});
		await repository.close();
		expect(await setup(name).repository.load('user-a')).toEqual({
			records: [{ key: 'note:1', entry: { kind: 'deleted' } }],
			cursor: initialSyncCursor
		});
	});
	it('distinguishes an unknown cursor from a confirmed empty workspace', async () => {
		const { repository } = setup();
		expect(await repository.load('user-a')).toEqual({ records: [], cursor: null });
	});

	it('persists the complete cursor together with its cache entries', async () => {
		const { repository } = setup();
		const cursor = initialSyncCursor;
		await repository.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [], cursor });
		expect(await repository.load('user-a')).toEqual({
			records: [{ key: 'note:1', entry }],
			cursor
		});
	});

	it('retains cached content after reopening storage', async () => {
		const { name, repository } = setup();
		await repository.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [] });
		await repository.close();
		const reopened = setup(name).repository;
		expect((await reopened.load('user-a')).records).toEqual([{ key: 'note:1', entry }]);
	});

	it('isolates both content and cursor between accounts', async () => {
		const { repository } = setup();
		await repository.commit('user-a', {
			put: [{ key: 'note:1', entry }],
			remove: [],
			cursor: initialSyncCursor
		});
		expect(await repository.load('user-b')).toEqual({ records: [], cursor: null });
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
