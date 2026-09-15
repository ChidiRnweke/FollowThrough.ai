import { cacheRepositoryContract } from '$lib/testing/sync/contracts/cache-contract';
import { WorkspaceDatabase } from './database';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	syncEtag,
	initialSyncCursor,
	syncCursorSchema,
	type ResourceState
} from '$lib/models/sync';
import { IndexedDbSyncCache } from './indexeddb-cache';

const databases: string[] = [];
const openRepositories: IndexedDbSyncCache<string>[] = [];
const setup = (name = `workspace-sync-test-${crypto.randomUUID()}`, accountId = 'user-a') => {
	const database = new WorkspaceDatabase(accountId, name);
	if (!databases.includes(database.name)) databases.push(database.name);
	const repository = new IndexedDbSyncCache(z.string(), database);
	openRepositories.push(repository);
	return { name, repository };
};

const entry: ResourceState<string> = {
	kind: 'present',
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
	it('does not let a stale tab replace a newer durable body', async () => {
		const { name, repository } = setup();
		const other = setup(name).repository;
		const newer: ResourceState<string> = {
			kind: 'present',
			snapshot: { etag: syncEtag(2n), value: 'Newer' }
		};
		await repository.commit('user-a', { put: [{ key: 'note:1', entry: newer }], remove: [] });
		await other.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [] });
		expect((await repository.load('user-a')).records).toEqual([{ key: 'note:1', entry: newer }]);
	});

	it('does not move a durable change cursor backwards when a stale tab commits', async () => {
		const { name, repository } = setup();
		const other = setup(name).repository;
		await repository.commit('user-a', { put: [], remove: [], cursor: syncCursorSchema.parse('2') });
		await other.commit('user-a', { put: [], remove: [], cursor: syncCursorSchema.parse('1') });
		expect((await repository.load('user-a')).cursor).toBe('2');
	});

	it('does not evict another tab’s new body because an earlier request found no object', async () => {
		const { name, repository } = setup();
		const other = setup(name).repository;
		await repository.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [] });
		await other.commit('user-a', { put: [], remove: [{ key: 'note:1', etag: null }] });
		expect((await repository.load('user-a')).records).toEqual([{ key: 'note:1', entry }]);
	});
	it('retains the deletion and acknowledged cursor together after reopening storage', async () => {
		const { name, repository } = setup();
		await repository.commit('user-a', {
			put: [{ key: 'note:1', entry: { kind: 'deleted', etag: syncEtag(1n) } }],
			remove: [],
			cursor: initialSyncCursor,
			inventoryComplete: true
		});
		await repository.close();
		expect(await setup(name).repository.load('user-a')).toEqual({
			inventoryComplete: true,
			records: [{ key: 'note:1', entry: { kind: 'deleted', etag: syncEtag(1n) } }],
			cursor: initialSyncCursor
		});
	});
	it('distinguishes an unknown cursor from a confirmed empty workspace', async () => {
		const { repository } = setup();
		expect(await repository.load('user-a')).toEqual({
			records: [],
			cursor: null,
			inventoryComplete: false
		});
	});

	it('persists the complete cursor together with its cache entries', async () => {
		const { repository } = setup();
		const cursor = initialSyncCursor;
		await repository.commit('user-a', {
			put: [{ key: 'note:1', entry }],
			remove: [],
			cursor,
			inventoryComplete: true
		});
		expect(await repository.load('user-a')).toEqual({
			inventoryComplete: true,
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
		const { name, repository } = setup();
		await repository.commit('user-a', {
			put: [{ key: 'note:1', entry }],
			remove: [],
			cursor: initialSyncCursor
		});
		expect(await setup(name, 'user-b').repository.load('user-b')).toEqual({
			records: [],
			cursor: null,
			inventoryComplete: false
		});
	});

	it('deletes only the requested account’s record', async () => {
		const { name, repository } = setup();
		const other = setup(name, 'user-b').repository;
		await repository.commit('user-a', { put: [{ key: 'note:1', entry }], remove: [] });
		await other.commit('user-b', { put: [{ key: 'note:1', entry }], remove: [] });
		await repository.commit('user-a', { put: [], remove: [{ key: 'note:1', etag: syncEtag(1n) }] });
		expect((await other.load('user-b')).records).toEqual([{ key: 'note:1', entry }]);
	});
});

cacheRepositoryContract(() => setup(undefined, 'alice').repository);

it('commits a full rich-content page and its checkpoint together', async () => {
	const { repository } = setup();
	const put = Array.from({ length: 32 }, (_, index) => ({
		key: `note:${index}`,
		entry: {
			kind: 'present' as const,
			snapshot: { etag: syncEtag(1n), value: 'Rich content paragraph. '.repeat(150) }
		}
	}));
	await repository.commit('user-a', {
		put,
		remove: [],
		cursor: syncCursorSchema.parse('32'),
		inventoryComplete: true
	});
	expect(await repository.load('user-a')).toEqual({
		records: [...put].sort((a, b) => a.key.localeCompare(b.key)),
		cursor: '32',
		inventoryComplete: true
	});
});
