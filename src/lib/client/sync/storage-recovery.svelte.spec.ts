import { ResourceCache } from './resource-cache';
import { InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import { afterEach, expect, it } from 'vitest';
import { Dexie } from 'dexie';
import { z } from 'zod';
import { WorkspaceDatabase } from './database';
import { DexieWorkspaceRepository } from './workspace-local-repository';
import { IndexedDbStorageRecovery } from './storage-recovery';
import { receiveResource, syncEtag } from '$lib/models/sync';

const databases: WorkspaceDatabase[] = [];
const setup = (account = 'alice', prefix = `recovery-${crypto.randomUUID()}`) => {
	const repository = new DexieWorkspaceRepository(account, z.string(), z.string(), prefix);
	databases.push(repository.database);
	return { repository, recovery: new IndexedDbStorageRecovery(prefix), prefix };
};
afterEach(async () => {
	for (const db of databases.splice(0)) {
		db.close();
		await Dexie.delete(db.name);
	}
});
const damage = async (repository: DexieWorkspaceRepository<string, string>) => {
	await repository.database.ready();
	await repository.database
		.table('records')
		.put({ key: 'note', entry: { kind: 'present', snapshot: 'Damaged original text' } });
};
it('blocks the account when persisted content is malformed', async () => {
	const { repository } = setup();
	await damage(repository);
	await expect(repository.read('alice')).rejects.toThrow('Export a copy');
});
it('preserves raw malformed content in an account export after startup fails', async () => {
	const { repository, recovery } = setup();
	await damage(repository);
	await repository.read('alice').catch(() => ({ kind: 'failure' }));
	expect(await (await recovery.downloadAccount('alice')).text()).toContain('Damaged original text');
});
it('rejects later writes through a storage instance stopped by corruption', async () => {
	const { repository } = setup();
	await damage(repository);
	await repository.read('alice').catch(() => ({ kind: 'failure' }));
	await expect(repository.cache.commit('alice', { put: [], remove: [] })).rejects.toThrow(
		'Export a copy'
	);
});
it('exports only the selected account database', async () => {
	const { repository, recovery, prefix } = setup();
	const other = setup('bob', prefix).repository;
	await repository.cache.commit('alice', {
		put: [
			{
				key: 'note',
				entry: receiveResource(undefined, { etag: syncEtag(1n), value: 'Alice private draft' })
			}
		],
		remove: []
	});
	await other.cache.commit('bob', {
		put: [
			{
				key: 'note',
				entry: receiveResource(undefined, { etag: syncEtag(1n), value: 'Bob private draft' })
			}
		],
		remove: []
	});
	const text = await (await recovery.downloadAccount('alice')).text();
	expect({
		own: text.includes('Alice private draft'),
		other: text.includes('Bob private draft')
	}).toEqual({ own: true, other: false });
});
it('cannot reopen an old instance after another tab resets the account', async () => {
	const { repository, recovery, prefix } = setup();
	const other = setup('alice', prefix).repository;
	await Promise.all([repository.read('alice'), other.read('alice')]);
	await recovery.resetAccount('alice');
	await expect(other.cache.commit('alice', { put: [], remove: [] })).rejects.toThrow('another tab');
});
it('starts a clean instance only after reset has completed', async () => {
	const { repository, recovery, prefix } = setup();
	await damage(repository);
	await recovery.resetAccount('alice');
	expect(await setup('alice', prefix).repository.read('alice')).toEqual({
		cache: { records: [], cursor: null, inventoryComplete: false },
		writes: { entries: [], receipts: new Map() }
	});
});
it('leaves another account intact when resetting this account', async () => {
	const { repository, recovery, prefix } = setup();
	const other = setup('bob', prefix).repository;
	await repository.read('alice');
	await other.cache.commit('bob', {
		put: [
			{ key: 'note', entry: receiveResource(undefined, { etag: syncEtag(1n), value: 'Keep me' }) }
		],
		remove: []
	});
	await recovery.resetAccount('alice');
	expect((await other.read('bob')).cache.records).toHaveLength(1);
});

it('cannot restore a reset account from an earlier network response', async () => {
	const { repository, recovery, prefix } = setup();
	const transport = new InMemorySyncTransport<string>();
	transport.records.set('note', { etag: syncEtag(1n), value: 'Old network response' });
	const cache = new ResourceCache('alice', { repository: repository.cache, transport });
	await cache.initialize();
	const paused = transport.pause('changes');
	const pending = cache.refresh();
	await paused.started;
	await recovery.resetAccount('alice');
	const fresh = setup('alice', prefix).repository;
	await fresh.read('alice');
	paused.release();
	await pending;
	expect((await fresh.read('alice')).cache).toEqual({
		records: [],
		cursor: null,
		inventoryComplete: false
	});
});
