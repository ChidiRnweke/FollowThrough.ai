import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { syncEtag } from '$lib/models/sync';
import type { WriteDraft } from '$lib/models/outbox';
import { IndexedDbOutbox } from './indexeddb-outbox';
import { IndexedDbSyncCache } from './indexeddb-cache';

const databases = new Set<string>();
const repositories: { close(): Promise<void> }[] = [];
const setup = (name = `outbox-test-${crypto.randomUUID()}`) => {
	databases.add(name);
	const outbox = new IndexedDbOutbox(z.string(), z.string(), name);
	const cache = new IndexedDbSyncCache(z.string(), name);
	repositories.push(outbox, cache);
	return { name, outbox, cache };
};
const draft = (key = 'note:1', command = 'create'): WriteDraft<string, string> => ({
	operationId: crypto.randomUUID(),
	key,
	command,
	base: null,
	basedOn: null,
	local: command,
	coalesce: null,
	references: []
});
const snapshot = { etag: syncEtag(1n), value: 'Saved' };

afterEach(async () => {
	for (const repository of repositories.splice(0)) await repository.close();
	for (const name of databases)
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(name);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error ?? new Error('Could not remove test storage'));
			request.onblocked = () => reject(new Error('Test storage remains open'));
		});
	databases.clear();
});

describe('durable local writes', () => {
	it('retains a locally created object after reopening storage', async () => {
		const { name, outbox } = setup();
		const input = draft();
		await outbox.append('alice', input);
		await outbox.close();
		expect((await setup(name).outbox.list('alice')).map((entry) => entry.intent.local)).toEqual([
			'create'
		]);
	});
	it('isolates pending writes between accounts', async () => {
		const { outbox } = setup();
		await outbox.append('alice', draft());
		expect(await outbox.list('bob')).toEqual([]);
	});
	it('serializes concurrent appends from separate tabs', async () => {
		const { name, outbox } = setup();
		const other = setup(name).outbox;
		await Promise.all([outbox.append('alice', draft()), other.append('alice', draft())]);
		const entries = await outbox.list('alice');
		expect(
			entries.map((entry) => ({
				sequence: entry.sequence,
				dependencies: entry.intent.dependencies
			}))
		).toEqual([
			{ sequence: 1, dependencies: [] },
			{ sequence: 2, dependencies: [entries[0].intent.operationId] }
		]);
	});
	it('keeps typing after submission as a separate dependent write', async () => {
		const { outbox } = setup();
		const first = { ...draft(), coalesce: 'document' };
		await outbox.append('alice', first);
		await outbox.take('alice');
		await outbox.append('alice', { ...draft('note:1', 'edited'), coalesce: 'document' });
		expect(
			(await outbox.list('alice')).map((entry) => ({
				command: entry.intent.command,
				state: entry.delivery.kind
			}))
		).toEqual([
			{ command: 'create', state: 'sending' },
			{ command: 'edited', state: 'queued' }
		]);
	});
	it('retries the exact submitted input after an interrupted session', async () => {
		const { name, outbox } = setup();
		await outbox.append('alice', draft());
		const sent = await outbox.take('alice');
		await outbox.close();
		const reopened = setup(name).outbox;
		await reopened.recover('alice');
		expect((await reopened.take('alice'))?.intent).toEqual(sent?.intent);
	});
	it('stores the authoritative value and rebases the dependent edit when acknowledging', async () => {
		const { outbox, cache } = setup();
		await outbox.append('alice', draft());
		const sent = await outbox.take('alice');
		if (!sent) throw new Error('Expected a submitted write');
		await outbox.append('alice', {
			...draft('note:1', 'edited'),
			basedOn: sent.intent.operationId
		});
		await outbox.settle('alice', sent, {
			kind: 'applied',
			receipt: { operationId: sent.intent.operationId, resource: { kind: 'found', snapshot } }
		});
		const entries = await outbox.list('alice');
		expect({
			records: (await cache.load('alice')).records,
			pending: entries.map((entry) => ({
				base: entry.intent.base,
				dependencies: entry.intent.dependencies,
				local: entry.intent.local
			}))
		}).toEqual({
			records: [{ key: 'note:1', entry: { kind: 'present', cache: { kind: 'cached', snapshot } } }],
			pending: [{ base: snapshot, dependencies: [], local: 'edited' }]
		});
	});
	it('retains the queued write when storing the receipt fails', async () => {
		const { outbox, cache } = setup();
		await outbox.append('alice', draft());
		const sent = await outbox.take('alice');
		if (!sent) throw new Error('Expected a submitted write');
		let failed = false;
		try {
			await outbox.settle('alice', sent, {
				kind: 'applied',
				receipt: { operationId: crypto.randomUUID(), resource: { kind: 'found', snapshot } }
			});
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			failed = true;
		}
		expect({
			failed,
			entries: await outbox.list('alice'),
			records: (await cache.load('alice')).records
		}).toEqual({ failed: true, entries: [sent], records: [] });
	});
	it('preserves conflicting edits while allowing unrelated objects to synchronize', async () => {
		const { outbox } = setup();
		await outbox.append('alice', draft());
		const sent = await outbox.take('alice');
		if (!sent) throw new Error('Expected a submitted write');
		await outbox.append('alice', draft('note:1', 'later edit'));
		await outbox.append('alice', draft('note:2', 'unrelated'));
		await outbox.settle('alice', sent, { kind: 'conflict', remote: { kind: 'found', snapshot } });
		expect({
			conflict: (await outbox.list('alice'))[0],
			next: (await outbox.take('alice'))?.intent.key
		}).toEqual({
			conflict: { ...sent, delivery: { kind: 'conflict', remote: { kind: 'found', snapshot } } },
			next: 'note:2'
		});
	});
});

describe('durable draft import', () => {
	it('does not resurrect an imported draft after its acknowledgement', async () => {
		const { outbox } = setup();
		const input = draft();
		await outbox.importOnce('alice', 'old-note', input, null);
		const sent = await outbox.take('alice');
		if (!sent) throw new Error('Expected a submitted import');
		await outbox.settle('alice', sent, {
			kind: 'applied',
			receipt: { operationId: input.operationId, resource: { kind: 'found', snapshot } }
		});
		await outbox.importOnce('alice', 'old-note', input, null);
		expect(await outbox.list('alice')).toEqual([]);
	});
	it('retains unversioned base, local, and remote copies across reopening', async () => {
		const { name, outbox } = setup();
		const input = { ...draft(), base: { etag: null, value: 'Original' }, local: 'Offline edit' };
		const remote = { kind: 'found' as const, snapshot: { etag: null, value: 'Other client' } };
		await outbox.importOnce('alice', 'old-note', input, remote);
		await outbox.close();
		const [saved] = await setup(name).outbox.list('alice');
		expect({
			base: saved.intent.base,
			local: saved.intent.local,
			delivery: saved.delivery
		}).toEqual({ base: input.base, local: input.local, delivery: { kind: 'conflict', remote } });
	});
	it('rolls back the import marker when appending fails', async () => {
		const { outbox } = setup();
		const input = draft();
		await outbox.append('alice', input);
		await outbox.importOnce('alice', 'old-note', input, null).catch(() => ({ kind: 'failure' }));
		const replacement = draft('note:2');
		await outbox.importOnce('alice', 'old-note', replacement, null);
		expect((await outbox.list('alice')).map((entry) => entry.intent.operationId)).toEqual([
			input.operationId,
			replacement.operationId
		]);
	});
});

describe('durable conflict resolution', () => {
	it('keeps the authoritative server copy after discarding a rejected local edit', async () => {
		const { outbox, cache } = setup();
		const input = draft();
		await outbox.append('alice', input);
		const sent = await outbox.take('alice');
		if (!sent) throw new Error('Expected submitted edit');
		await outbox.settle('alice', sent, { kind: 'conflict', remote: { kind: 'found', snapshot } });
		await outbox.discard('alice', [input.operationId]);
		expect({
			pending: await outbox.list('alice'),
			records: (await cache.load('alice')).records
		}).toEqual({
			pending: [],
			records: [{ key: input.key, entry: { kind: 'present', cache: { kind: 'cached', snapshot } } }]
		});
	});
	it('makes a confirmed keep-local decision durable with a new guarded operation', async () => {
		const { outbox } = setup();
		const input = draft();
		await outbox.importOnce('alice', 'conflict', input, { kind: 'found', snapshot });
		const replacement = crypto.randomUUID();
		await outbox.keepLocal('alice', input.operationId, replacement);
		const sent = await outbox.take('alice');
		expect({
			id: sent?.intent.operationId,
			base: sent?.intent.base,
			local: sent?.intent.local
		}).toEqual({ id: replacement, base: snapshot, local: input.local });
	});
	it('stores the authoritative tombstone while retaining the offline edit', async () => {
		const { outbox, cache } = setup();
		const input = draft();
		await outbox.append('alice', input);
		const sent = await outbox.take('alice');
		if (!sent) throw new Error('Expected submitted edit');
		const remote = { kind: 'deleted' as const, etag: syncEtag(2n) };
		await outbox.settle('alice', sent, { kind: 'conflict', remote });
		expect({
			local: (await outbox.list('alice'))[0].intent.local,
			records: (await cache.load('alice')).records
		}).toEqual({ local: input.local, records: [{ key: input.key, entry: remote }] });
	});
	it('persists an imported base validation alongside its authoritative server copy', async () => {
		const { outbox, cache } = setup();
		const input = { ...draft(), base: { etag: null, value: 'Original' } };
		await outbox.append('alice', input);
		await outbox.resolveBase('alice', input.operationId, {
			kind: 'conflict',
			remote: { kind: 'found', snapshot }
		});
		expect({
			delivery: (await outbox.list('alice'))[0].delivery,
			records: (await cache.load('alice')).records
		}).toEqual({
			delivery: { kind: 'conflict', remote: { kind: 'found', snapshot } },
			records: [{ key: input.key, entry: { kind: 'present', cache: { kind: 'cached', snapshot } } }]
		});
	});
});

describe('local write validation', () => {
	it('rejects invalid local input without poisoning the queue or consuming a sequence', async () => {
		const { outbox } = setup();
		await outbox
			.append('alice', { ...draft(), operationId: 'invalid' })
			.catch(() => ({ kind: 'failure' }));
		await outbox.append('alice', draft());
		expect((await outbox.list('alice')).map((entry) => entry.sequence)).toEqual([1]);
	});
});
