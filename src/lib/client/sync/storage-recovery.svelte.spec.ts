import { initialCacheGeneration } from '$lib/models/sync';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { syncCursorSchema, syncEtag } from '$lib/models/sync';
import { completed, WorkspaceDatabase } from './database';
import { IndexedDbSyncCache } from './indexeddb-cache';
import { IndexedDbOutbox } from './indexeddb-outbox';
import { IndexedDbStorageRecovery } from './storage-recovery';
import type { WriteDraft } from '$lib/models/outbox';
const names: string[] = [];
const repositories: { close(): Promise<void> }[] = [];
const setup = () => {
	const name = `sync-recovery-${crypto.randomUUID()}`;
	names.push(name);
	const cache = new IndexedDbSyncCache(z.string(), name);
	const outbox = new IndexedDbOutbox(z.string(), z.string(), name);
	repositories.push(cache, outbox);
	return { name, cache, outbox, recovery: new IndexedDbStorageRecovery(name) };
};
const draft = (operationId = crypto.randomUUID()): WriteDraft<string, string> => ({
	operationId,
	key: 'note:1',
	command: 'save',
	base: null,
	basedOn: null,
	local: 'My work',
	coalesce: null,
	references: []
});
const damage = async (name: string, store: string, row: object) => {
	const database = new WorkspaceDatabase(name);
	await database.open();
	try {
		const transaction = database.backendDB().transaction(store, 'readwrite');
		const done = completed(transaction);
		transaction.objectStore(store).put(row);
		await done;
	} finally {
		database.close();
	}
};
afterEach(async () => {
	for (const repository of repositories.splice(0)) await repository.close();
	for (const name of names.splice(0))
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(name);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
});
describe('damaged workspace storage recovery', () => {
	it('preserves healthy bodies and resets the inventory when one body is damaged', async () => {
		const { name, cache } = setup();
		await cache.commit('account', {
			put: [
				{
					key: 'note:2',
					entry: {
						kind: 'present',
						etag: syncEtag(1n),
						body: { etag: syncEtag(1n), value: 'Healthy' }
					}
				}
			],
			remove: [],
			cursor: syncCursorSchema.parse('10')
		});
		await damage(name, 'records', {
			accountId: 'account',
			key: 'note:1',
			schemaVersion: 3,
			entry: 'broken'
		});
		const loaded = await cache.load('account');
		expect({
			cursor: loaded.cursor,
			complete: loaded.inventoryComplete,
			keys: loaded.records.map((row) => row.key),
			generation: loaded.generation
		}).toEqual({
			cursor: null,
			complete: false,
			keys: ['note:1', 'note:2'],
			generation: expect.any(String)
		});
	});
	it('rejects an old tab checkpoint after another tab repairs storage', async () => {
		const { name, cache } = setup();
		await damage(name, 'records', {
			accountId: 'account',
			key: 'note:1',
			schemaVersion: 3,
			entry: 'broken'
		});
		await cache.load('account');
		await expect(
			cache.commit('account', {
				put: [],
				remove: [],
				generation: initialCacheGeneration,
				cursor: syncCursorSchema.parse('99')
			})
		).rejects.toThrow('recovered in another tab');
	});
	it('exports the original damaged body', async () => {
		const { name, cache, recovery } = setup();
		await damage(name, 'records', {
			accountId: 'account',
			key: 'note:1',
			schemaVersion: 3,
			entry: 'irreplaceable raw bytes'
		});
		await cache.load('account');
		const blob = await recovery.download('account', 'records', 'note:1');
		expect(await blob.text()).toContain('irreplaceable raw bytes');
	});
	it('does not hide healthy edits because one queued row is malformed', async () => {
		const { name, outbox, recovery } = setup();
		await outbox.append('account', draft());
		await damage(name, 'outbox', {
			accountId: 'account',
			entry: { sequence: 2, intent: { operationId: crypto.randomUUID() }, delivery: 'broken' }
		});
		expect({
			retained: (await outbox.list('account')).length,
			quarantined: (await recovery.list('account')).filter((item) => item.impact.kind === 'write')
				.length
		}).toEqual({ retained: 1, quarantined: 1 });
	});
	it('preserves a damaged legacy marker instead of reimporting a possibly settled edit', async () => {
		const { name, outbox, recovery } = setup();
		await damage(name, 'imports', {
			accountId: 'account',
			source: 'legacy',
			operationId: 'broken'
		});
		const result = await outbox.importOnce('account', 'legacy', draft(), null);
		expect({
			kind: result.kind,
			pending: (await outbox.list('account')).length,
			quarantined: (await recovery.list('account')).map((item) => item.source)
		}).toEqual({ kind: 'failure', pending: 0, quarantined: ['imports'] });
	});
});

it('exports only the selected account edits without needing bootstrap metadata', async () => {
	const { outbox, recovery } = setup();
	const own = draft();
	const other = draft();
	await outbox.append('account', own);
	await outbox.append('other', other);
	const content = await (await recovery.downloadAccount('account')).text();
	expect({
		own: content.includes(own.operationId),
		other: content.includes(other.operationId)
	}).toEqual({ own: true, other: false });
});

it('repairs damaged recovery metadata without hiding healthy recovery entries', async () => {
	const { name, recovery } = setup();
	await recovery.save(
		{
			accountId: 'account',
			source: 'records',
			key: 'healthy',
			message: 'Saved recovery',
			impact: { kind: 'cache' }
		},
		'preserved'
	);
	await damage(name, 'quarantine', {
		accountId: 'account',
		source: 'records',
		key: 'broken',
		impact: 'unreadable',
		raw: 'damaged metadata'
	});
	const items = await recovery.list('account');
	expect(items.map((item) => item.source).sort()).toEqual(['records', 'recovery-metadata']);
});
it('rebuilds inventory under a fresh token when its recovery marker is damaged', async () => {
	const { name, cache } = setup();
	await cache.commit('account', { put: [], remove: [], cursor: syncCursorSchema.parse('42') });
	await damage(name, 'recovery-heads', { accountId: 'account', generation: 'broken' });
	const loaded = await cache.load('account');
	expect({
		cursor: loaded.cursor,
		complete: loaded.inventoryComplete,
		changed: loaded.generation !== initialCacheGeneration
	}).toEqual({ cursor: null, complete: false, changed: true });
});

// SYNC-RECOVERY: removal is a durable decision, including repeated legacy discovery.
it('can submit healthy work after explicitly removing an exported unknown legacy blocker', async () => {
	const { name, recovery, outbox } = setup();
	const item = {
		accountId: 'account',
		source: 'legacy-note',
		key: 'account:old-note',
		message: 'Unreadable old edit',
		impact: { kind: 'write' as const, operationId: null }
	};
	await recovery.save(item, 'Original damaged content');
	await recovery.download('account', item.source, item.key);
	await recovery.remove('account', item.source, item.key);
	const reopened = new IndexedDbStorageRecovery(name);
	await reopened.save(item, 'Original damaged content');
	const edit = draft();
	await outbox.append('account', edit);
	const sent = await outbox.take('account');
	expect({ pending: sent?.intent.operationId, recovery: await reopened.list('account') }).toEqual({
		pending: edit.operationId,
		recovery: []
	});
});

it('submits a provably independent edit while a known resource is quarantined', async () => {
	const { outbox, recovery } = setup();
	await recovery.save(
		{
			accountId: 'account',
			source: 'legacy-note',
			key: 'account:old',
			message: 'Unreadable older note',
			impact: { kind: 'resource', key: 'note:1', operationId: null }
		},
		'preserved'
	);
	await outbox.append('account', draft());
	const independent = { ...draft(), key: 'note:2' };
	await outbox.append('account', independent);
	expect((await outbox.take('account'))?.intent.operationId).toBe(independent.operationId);
});

it('preserves a new damaged cache copy after an earlier recovery was removed', async () => {
	const { recovery } = setup();
	const item = {
		accountId: 'account',
		source: 'records',
		key: 'note:1',
		message: 'Damaged cached copy',
		impact: { kind: 'cache' as const }
	};
	await recovery.save(item, 'Old damaged copy');
	await recovery.remove('account', item.source, item.key);
	await recovery.save(item, 'New damaged copy');
	expect(await (await recovery.download('account', item.source, item.key)).text()).toContain(
		'New damaged copy'
	);
});

it.each([true, false])(
	'keeps descendants visible after recovery removal when ancestor identity is readable: %s',
	async (identityReadable) => {
		const { name, outbox, recovery } = setup();
		const parent = draft();
		const child = draft();
		await outbox.append('account', parent);
		await outbox.append('account', { ...child, basedOn: parent.operationId });
		const [entry] = await outbox.list('account');
		await damage(name, 'outbox', {
			accountId: 'account',
			entry: {
				...entry,
				intent: {
					...entry.intent,
					command: 42,
					operationId: identityReadable ? entry.intent.operationId : null
				}
			}
		});
		await outbox.list('account');
		const [item] = await recovery.list('account');
		await recovery.download('account', item.source, item.key);
		await recovery.remove('account', item.source, item.key);
		expect(
			(await outbox.list('account')).map((entry) => ({
				delivery: entry.delivery.kind,
				basedOn: entry.intent.basedOn
			}))
		).toEqual([{ delivery: 'rejected', basedOn: parent.operationId }]);
	}
);

it('can finish recovery removal again after its durable removal marker exists', async () => {
	const { recovery } = setup();
	const item = {
		accountId: 'account',
		source: 'imports',
		key: 'damaged',
		message: 'Damaged',
		impact: { kind: 'write' as const, operationId: null }
	};
	await recovery.save(item, 'Original');
	await recovery.remove('account', item.source, item.key);
	await recovery.remove('account', item.source, item.key);
	expect(await recovery.list('account')).toEqual([]);
});

it('quarantines legacy version facts that contradict their retained body', async () => {
	const { name, cache, recovery } = setup();
	await damage(name, 'records', {
		accountId: 'account',
		key: 'note:1',
		schemaVersion: 2,
		entry: {
			kind: 'present',
			cache: {
				kind: 'updating',
				target: syncEtag(1n),
				previous: { etag: syncEtag(2n), value: 'Recover this copy' },
				transfer: { kind: 'queued' }
			}
		}
	});
	const loaded = await cache.load('account');
	const exported = await (await recovery.download('account', 'records', 'note:1')).text();
	expect({
		state: loaded.records[0].entry,
		retained: exported.includes('Recover this copy')
	}).toEqual({ state: { kind: 'requested' }, retained: true });
});
