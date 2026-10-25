import { afterEach, describe, expect, it } from 'vitest';
import { Dexie } from 'dexie';
import { z } from 'zod';
import {
	initialSyncCursor,
	syncCursorSchema,
	syncEtag,
	type ResourceState
} from '$lib/models/sync';
import type { OutboxEntry, WriteDraft } from '$lib/models/outbox';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import { accountDatabaseName } from './database';
import { IndexedDbWorkspaceReplica } from './replica';
import { workspaceReplicaContract } from '$lib/testing/workspace/contracts/replica-contract';

const prefixes = new Set<string>();
const replicas: { replica: IndexedDbWorkspaceReplica<string, string>; accounts: Set<string> }[] =
	[];
const subscriptions: (() => void)[] = [];
/** One tab's connection; tabs that share a prefix share the account databases. */
const tab = (prefix = `replica-${crypto.randomUUID()}`, ...accounts: string[]) => {
	prefixes.add(prefix);
	const replica = new IndexedDbWorkspaceReplica(z.string(), z.string(), prefix);
	const opened = new Set(accounts.length ? accounts : ['alice']);
	for (const account of opened) replica.open(account);
	replicas.push({ replica, accounts: opened });
	return { replica, prefix };
};
afterEach(async () => {
	for (const stop of subscriptions.splice(0)) stop();
	const accounts = new Set<string>();
	for (const { replica, accounts: opened } of replicas.splice(0))
		for (const account of opened) {
			replica.close(account);
			accounts.add(account);
		}
	for (const prefix of prefixes)
		for (const account of accounts) await Dexie.delete(accountDatabaseName(account, prefix));
	prefixes.clear();
});

const body = (version: bigint, value: string): ResourceState<string> => ({
	kind: 'present',
	snapshot: { etag: syncEtag(version), value }
});
const draft = (command: string): WriteDraft<string, string> => ({
	operationId: crypto.randomUUID(),
	key: 'note:1',
	command,
	base: null,
	basedOn: null,
	local: command,
	observed: null,
	coalesce: null,
	references: []
});
/** Queues one write the way the outbox does: allocate its order, then store its intent. */
const queue = (replica: IndexedDbWorkspaceReplica<string, string>, input = draft('create')) =>
	replica.transaction('alice', ['outbox'], async (tx) => {
		const previous = await tx.entries();
		const sequence = await tx.allocate(input);
		const entry: OutboxEntry<string, string> = {
			sequence,
			intent: { ...input, dependencies: [] },
			delivery: { kind: 'queued' }
		};
		await tx.replace(previous, [...previous, entry]);
		return entry;
	});
const valueOf = (projection: WorkspaceLocalProjection<string, string>) => {
	const entry = projection.cache.records.find((row) => row.key === 'note:1')?.entry;
	return entry?.kind === 'present' ? entry.snapshot.value : undefined;
};

describe('durable workspace cache', () => {
	it('does not let a stale tab replace a newer durable body or checkpoint', async () => {
		const { replica, prefix } = tab();
		const other = tab(prefix).replica;
		await replica.commitCache('alice', {
			put: [{ key: 'note:1', entry: body(2n, 'Newer') }],
			checkpoint: { cursor: syncCursorSchema.parse('2'), inventoryComplete: false }
		});
		await other.commitCache('alice', {
			put: [{ key: 'note:1', entry: body(1n, 'Earlier') }],
			checkpoint: { cursor: syncCursorSchema.parse('1'), inventoryComplete: false }
		});
		const stored = (await replica.read('alice')).cache;
		expect({ records: stored.records, cursor: stored.cursor }).toEqual({
			records: [{ key: 'note:1', entry: body(2n, 'Newer') }],
			cursor: '2'
		});
	});
	it('keeps a tombstone over the body of the same version', async () => {
		const { replica } = tab();
		await replica.commitCache('alice', { put: [{ key: 'note:1', entry: body(1n, 'Saved') }] });
		await replica.commitCache('alice', {
			put: [{ key: 'note:1', entry: { kind: 'deleted', etag: syncEtag(1n) } }]
		});
		expect((await replica.read('alice')).cache.records).toEqual([
			{ key: 'note:1', entry: { kind: 'deleted', etag: syncEtag(1n) } }
		]);
	});
	it('rejects an ambiguous change before any body becomes durable', async () => {
		const { replica } = tab();
		const row = { key: 'note:1', entry: body(1n, 'Earlier') };
		await expect(replica.commitCache('alice', { put: [row, row] })).rejects.toThrow(
			'each resource only once'
		);
	});
	it('retains a deletion and its completed checkpoint together after reopening storage', async () => {
		const { replica, prefix } = tab();
		await replica.commitCache('alice', {
			put: [{ key: 'note:1', entry: { kind: 'deleted', etag: syncEtag(1n) } }],
			checkpoint: { cursor: initialSyncCursor, inventoryComplete: true }
		});
		replica.close('alice');
		expect((await tab(prefix).replica.read('alice')).cache).toEqual({
			inventoryComplete: true,
			records: [{ key: 'note:1', entry: { kind: 'deleted', etag: syncEtag(1n) } }],
			cursor: initialSyncCursor
		});
	});
	it('distinguishes an unknown cursor from a confirmed empty workspace', async () => {
		expect((await tab().replica.read('alice')).cache).toEqual({
			records: [],
			cursor: null,
			inventoryComplete: false
		});
	});
	it('isolates content and cursor between accounts', async () => {
		const { replica, prefix } = tab();
		await replica.commitCache('alice', {
			put: [{ key: 'note:1', entry: body(1n, 'Alice private note') }],
			checkpoint: { cursor: initialSyncCursor, inventoryComplete: true }
		});
		expect((await tab(prefix, 'bob').replica.read('bob')).cache).toEqual({
			records: [],
			cursor: null,
			inventoryComplete: false
		});
	});
	it('commits a full rich-content page and its checkpoint together', async () => {
		const { replica } = tab();
		const put = Array.from({ length: 32 }, (_, index) => ({
			key: `note:${index}`,
			entry: body(1n, 'Rich content paragraph. '.repeat(150))
		}));
		await replica.commitCache('alice', {
			put,
			checkpoint: { cursor: syncCursorSchema.parse('32'), inventoryComplete: true }
		});
		expect((await replica.read('alice')).cache).toEqual({
			records: [...put].sort((a, b) => a.key.localeCompare(b.key)),
			cursor: '32',
			inventoryComplete: true
		});
	});
});

describe('durable outbox transactions', () => {
	it('retains a queued write after reopening storage', async () => {
		const { replica, prefix } = tab();
		await queue(replica);
		replica.close('alice');
		expect((await tab(prefix).replica.list('alice')).map((entry) => entry.intent.local)).toEqual([
			'create'
		]);
	});
	it('isolates queued writes between accounts', async () => {
		const { replica, prefix } = tab();
		await queue(replica);
		expect(await tab(prefix, 'bob').replica.list('bob')).toEqual([]);
	});
	it('serializes concurrent transitions from separate tabs', async () => {
		const { replica, prefix } = tab();
		const other = tab(prefix).replica;
		await Promise.all([queue(replica, draft('First')), queue(other, draft('Second'))]);
		expect((await replica.list('alice')).map((entry) => entry.intent.command).sort()).toEqual([
			'First',
			'Second'
		]);
	});
	it('rolls back the allocation and every write of a failed transition', async () => {
		const { replica } = tab();
		await expect(
			replica.transaction('alice', ['outbox', 'records', 'receipts'], async (tx) => {
				await tx.allocate(draft('Lost'));
				await tx.receiveResource('note:1', body(1n, 'Lost'));
				throw new Error('The decision failed');
			})
		).rejects.toThrow('The decision failed');
		const queued = await queue(replica);
		const projection = await replica.read('alice');
		expect({ sequence: queued.sequence, records: projection.cache.records }).toEqual({
			sequence: 1,
			records: []
		});
	});
	it('rejects invalid input without touching stored data', () => {
		const replica = new IndexedDbWorkspaceReplica(z.string(), z.string().min(3));
		expect(() => replica.validate({ ...draft('ok'), local: 'no' })).toThrow();
	});
});

describe('live observation', () => {
	it('observes a body replacement from another connection with an unchanged record count', async () => {
		const { replica, prefix } = tab();
		const follower = tab(prefix).replica;
		await replica.commitCache('alice', { put: [{ key: 'note:1', entry: body(1n, 'Original') }] });
		const initial = Promise.withResolvers<void>();
		const changed = Promise.withResolvers<string>();
		subscriptions.push(
			follower.observe(
				'alice',
				(projection) => {
					if (valueOf(projection) === 'Original') initial.resolve();
					if (valueOf(projection) === 'Changed') changed.resolve('Changed');
				},
				(error) => {
					initial.reject(error);
					changed.reject(error);
				}
			)
		);
		await initial.promise;
		await replica.commitCache('alice', { put: [{ key: 'note:1', entry: body(2n, 'Changed') }] });
		expect(await changed.promise).toBe('Changed');
	});
	it('observes a settlement as one coherent body, queue and receipt across connections', async () => {
		const { replica, prefix } = tab();
		const follower = tab(prefix).replica;
		const queued = await queue(replica);
		const operationId = queued.intent.operationId;
		const initial = Promise.withResolvers<void>();
		const settled = Promise.withResolvers<void>();
		const observed: { body?: string; pending: readonly string[]; receipt?: string }[] = [];
		subscriptions.push(
			follower.observe(
				'alice',
				(projection) => {
					const state = {
						body: valueOf(projection),
						pending: projection.writes.entries.map((entry) => entry.intent.operationId),
						receipt: projection.writes.receipts.get('note:1')?.operationId
					};
					observed.push(state);
					if (state.pending.includes(operationId)) initial.resolve();
					if (!state.pending.length) settled.resolve();
				},
				(error) => {
					initial.reject(error);
					settled.reject(error);
				}
			)
		);
		await initial.promise;
		await replica.transaction('alice', ['outbox', 'records', 'receipts'], async (tx) => {
			await tx.replace(await tx.entries(), []);
			await tx.putReceipt('note:1', {
				operationId,
				resource: { kind: 'found', snapshot: { etag: syncEtag(1n), value: 'Saved' } }
			});
			await tx.receiveResource('note:1', body(1n, 'Saved'));
		});
		await settled.promise;
		expect({
			settled: observed.at(-1),
			coherent: observed.every(
				(state) =>
					state.pending.includes(operationId) ||
					(state.body === 'Saved' && state.receipt === operationId)
			)
		}).toEqual({ settled: { body: 'Saved', pending: [], receipt: operationId }, coherent: true });
	});
	it('leaves a healthy observed projection idle until stored data changes', async () => {
		const { replica, prefix } = tab();
		const follower = tab(prefix).replica;
		await replica.commitCache('alice', { put: [{ key: 'note:1', entry: body(1n, 'Original') }] });
		const ready = Promise.withResolvers<void>();
		const observed: (string | undefined)[] = [];
		subscriptions.push(
			follower.observe(
				'alice',
				(projection) => {
					observed.push(valueOf(projection));
					ready.resolve();
				},
				ready.reject
			)
		);
		await ready.promise;
		// Allow live-query invalidations to finish several browser task turns.
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(observed).toEqual(['Original']);
	});
	it('never publishes another account’s projection to an account observer', async () => {
		const { replica, prefix } = tab(undefined, 'alice', 'bob');
		await replica.commitCache('alice', {
			put: [{ key: 'note:1', entry: body(1n, 'Alice private note') }]
		});
		await replica.commitCache('bob', {
			put: [{ key: 'note:1', entry: body(2n, 'Bob private note') }]
		});
		const follower = tab(prefix).replica;
		const ready = Promise.withResolvers<void>();
		const observed: (string | undefined)[] = [];
		subscriptions.push(
			follower.observe(
				'alice',
				(projection) => {
					observed.push(valueOf(projection));
					ready.resolve();
				},
				ready.reject
			)
		);
		await ready.promise;
		await replica.read('bob');
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(observed).toEqual(['Alice private note']);
	});
});

describe('storage recovery', () => {
	const damage = async (prefix: string) => {
		const database = new Dexie(accountDatabaseName('alice', prefix));
		database
			.version(1)
			.stores({ records: 'key', outbox: '++sequence', receipts: 'key', meta: 'key' });
		await database.table('records').put({
			key: 'note:1',
			entry: { kind: 'present', snapshot: 'Damaged original text' }
		});
		database.close();
	};
	it('blocks the account when persisted content is malformed', async () => {
		const { replica, prefix } = tab();
		await damage(prefix);
		await expect(replica.read('alice')).rejects.toThrow('Export a copy');
	});
	it('preserves raw malformed content in an account export after reading fails', async () => {
		const { replica, prefix } = tab();
		await damage(prefix);
		await replica.read('alice').catch(() => ({ kind: 'failure' }));
		expect(await (await replica.exportAccount('alice')).text()).toContain('Damaged original text');
	});
	it('rejects later writes through a connection stopped by corruption', async () => {
		const { replica, prefix } = tab();
		await damage(prefix);
		await replica.read('alice').catch(() => ({ kind: 'failure' }));
		await expect(replica.commitCache('alice', { put: [] })).rejects.toThrow('Export a copy');
	});
	it('exports only the selected account database', async () => {
		const { replica } = tab(undefined, 'alice', 'bob');
		await replica.commitCache('alice', { put: [{ key: 'note', entry: body(1n, 'Alice draft') }] });
		await replica.commitCache('bob', { put: [{ key: 'note', entry: body(1n, 'Bob draft') }] });
		const text = await (await replica.exportAccount('alice')).text();
		expect({ own: text.includes('Alice draft'), other: text.includes('Bob draft') }).toEqual({
			own: true,
			other: false
		});
	});
	it('cannot reuse another tab’s connection after this tab resets the account', async () => {
		const { replica, prefix } = tab();
		const other = tab(prefix).replica;
		await Promise.all([replica.read('alice'), other.read('alice')]);
		await replica.resetAccount('alice');
		await expect(other.commitCache('alice', { put: [] })).rejects.toThrow('another tab');
	});
	it('starts clean only after the reset has completed', async () => {
		const { replica, prefix } = tab();
		await damage(prefix);
		await replica.resetAccount('alice');
		replica.open('alice');
		expect(await replica.read('alice')).toEqual({
			cache: { records: [], cursor: null, inventoryComplete: false },
			writes: { entries: [], receipts: new Map() }
		});
	});
	it('leaves another account intact when resetting this account', async () => {
		const { replica } = tab(undefined, 'alice', 'bob');
		await replica.commitCache('bob', { put: [{ key: 'note', entry: body(1n, 'Keep me') }] });
		await replica.resetAccount('alice');
		expect((await replica.read('bob')).cache.records).toEqual([
			{ key: 'note', entry: body(1n, 'Keep me') }
		]);
	});
});

workspaceReplicaContract(() => tab(undefined, 'alice', 'bob').replica);
