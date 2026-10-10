import { createCachePersistence } from '$lib/factories/sync/cache-persistence';
import { createDurableOutbox } from '$lib/factories/sync/durable-outbox';
import { rebaseWorkspaceRecord } from '$lib/controllers/workspace/rebase';
import { wholeValueRebase } from '$lib/services/sync/rebase';
import { WorkspaceDatabase } from './database';
import { workspaceCommandSchema } from '$lib/models/workspace-mutations';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { widgetTemplates } from '$lib/models/widgets';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { outboxRepositoryContract } from '$lib/testing/sync/contracts/outbox-contract';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { syncEtag } from '$lib/models/sync';
import type { WriteDraft } from '$lib/models/outbox';
import { IndexedDbOutbox } from './indexeddb-outbox';
import { IndexedDbSyncCache } from './indexeddb-cache';

const databases = new Set<string>();
const repositories: { close(): Promise<void> }[] = [];
const setup = (name = `outbox-test-${crypto.randomUUID()}`, accountId = 'alice') => {
	databases.add(new WorkspaceDatabase(accountId, name).name);
	const outbox = new IndexedDbOutbox(
		z.string(),
		z.string(),
		new WorkspaceDatabase(accountId, name)
	);
	const outboxWrites = createDurableOutbox(outbox, wholeValueRebase<string>());
	const cacheStorage = new IndexedDbSyncCache(z.string(), new WorkspaceDatabase(accountId, name));
	const cache = createCachePersistence(cacheStorage);
	repositories.push(outbox, cacheStorage);
	return { name, outbox, outboxWrites, cache };
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
		const { name, outbox, outboxWrites } = setup();
		const input = draft();
		await outboxWrites.append('alice', input);
		await outbox.close();
		expect((await setup(name).outbox.list('alice')).map((entry) => entry.intent.local)).toEqual([
			'create'
		]);
	});
	it('isolates pending writes between accounts', async () => {
		const { name, outboxWrites } = setup();
		await outboxWrites.append('alice', draft());
		expect(await setup(name, 'bob').outbox.list('bob')).toEqual([]);
	});
	it('serializes concurrent appends from separate tabs', async () => {
		const { name, outbox, outboxWrites } = setup();
		const other = setup(name).outboxWrites;
		await Promise.all([outboxWrites.append('alice', draft()), other.append('alice', draft())]);
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
		const { outbox, outboxWrites } = setup();
		const first = { ...draft(), coalesce: 'document' };
		await outboxWrites.append('alice', first);
		await outboxWrites.take('alice');
		await outboxWrites.append('alice', { ...draft('note:1', 'edited'), coalesce: 'document' });
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
		const { name, outbox, outboxWrites } = setup();
		await outboxWrites.append('alice', draft());
		const sent = await outboxWrites.take('alice');
		await outbox.close();
		const reopenedWrites = setup(name).outboxWrites;
		await reopenedWrites.recover('alice');
		expect((await reopenedWrites.take('alice'))?.intent).toEqual(sent?.intent);
	});
	it('stores the authoritative value and rebases the dependent edit when acknowledging', async () => {
		const { outbox, outboxWrites, cache } = setup();
		await outboxWrites.append('alice', draft());
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected a submitted write');
		await outboxWrites.append('alice', {
			...draft('note:1', 'edited'),
			basedOn: sent.intent.operationId
		});
		await outboxWrites.settle('alice', sent, {
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
			records: [{ key: 'note:1', entry: { kind: 'present', snapshot: snapshot } }],
			pending: [{ base: snapshot, dependencies: [], local: 'edited' }]
		});
	});
	it('retains the queued write when storing the receipt fails', async () => {
		const { outbox, outboxWrites, cache } = setup();
		await outboxWrites.append('alice', draft());
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected a submitted write');
		let failed = false;
		try {
			await outboxWrites.settle('alice', sent, {
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
		const { outbox, outboxWrites } = setup();
		await outboxWrites.append('alice', draft());
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected a submitted write');
		await outboxWrites.append('alice', draft('note:1', 'later edit'));
		await outboxWrites.append('alice', draft('note:2', 'unrelated'));
		await outboxWrites.settle('alice', sent, {
			kind: 'conflict',
			remote: { kind: 'found', snapshot }
		});
		expect({
			conflict: (await outbox.list('alice'))[0],
			next: (await outboxWrites.take('alice'))?.intent.key
		}).toEqual({
			conflict: { ...sent, delivery: { kind: 'conflict', remote: { kind: 'found', snapshot } } },
			next: 'note:2'
		});
	});
});

describe('durable conflict resolution', () => {
	it('queues a non-overlapping conflict again together with the server copy it rebased onto', async () => {
		const { outbox, outboxWrites, cache } = setup();
		const input = { ...draft('note:1', 'Edited'), base: { etag: syncEtag(1n), value: 'Original' } };
		await outboxWrites.append('alice', input);
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected submitted edit');
		const newer = { etag: syncEtag(2n), value: 'Original' };
		await outboxWrites.settle('alice', sent, {
			kind: 'conflict',
			remote: { kind: 'found', snapshot: newer }
		});
		const [entry] = await outbox.list('alice');
		expect({
			base: entry.intent.base,
			delivery: entry.delivery,
			records: (await cache.load('alice')).records
		}).toEqual({
			base: newer,
			delivery: { kind: 'queued' },
			records: [{ key: input.key, entry: { kind: 'present', snapshot: newer } }]
		});
	});
	it('keeps the authoritative server copy after discarding a rejected local edit', async () => {
		const { outbox, outboxWrites, cache } = setup();
		const input = draft();
		await outboxWrites.append('alice', input);
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected submitted edit');
		await outboxWrites.settle('alice', sent, {
			kind: 'conflict',
			remote: { kind: 'found', snapshot }
		});
		await outboxWrites.discard('alice', [input.operationId]);
		expect({
			pending: await outbox.list('alice'),
			records: (await cache.load('alice')).records
		}).toEqual({
			pending: [],
			records: [{ key: input.key, entry: { kind: 'present', snapshot: snapshot } }]
		});
	});
	it('makes a confirmed keep-local decision durable with a new guarded operation', async () => {
		const { outboxWrites } = setup();
		const input = { ...draft('note:1', 'Edited'), base: { etag: syncEtag(1n), value: 'Original' } };
		await outboxWrites.append('alice', input);
		const original = await outboxWrites.take('alice');
		if (!original) throw new Error('Expected queued edit');
		await outboxWrites.settle('alice', original, {
			kind: 'conflict',
			remote: { kind: 'found', snapshot }
		});
		const replacement = crypto.randomUUID();
		await outboxWrites.keepLocal('alice', input.operationId, replacement);
		const sent = await outboxWrites.take('alice');
		expect({
			id: sent?.intent.operationId,
			base: sent?.intent.base,
			local: sent?.intent.local
		}).toEqual({ id: replacement, base: snapshot, local: input.local });
	});
	it('preserves both creation-conflict copies when keep-local is refused', async () => {
		const { outbox, outboxWrites, name } = setup();
		const input = draft();
		await outboxWrites.append('alice', input);
		const submitted = await outboxWrites.take('alice');
		if (!submitted) throw new Error('Expected queued creation');
		await outboxWrites.settle('alice', submitted, {
			kind: 'conflict',
			remote: { kind: 'found', snapshot }
		});
		const [original] = await outbox.list('alice');
		const outcome = await outboxWrites
			.keepLocal('alice', input.operationId, crypto.randomUUID())
			.catch((error) => ({
				kind: 'failure' as const,
				message: error instanceof Error ? error.message : 'Storage failure'
			}));
		await outbox.close();
		const [retained] = await setup(name).outbox.list('alice');
		expect({ outcome, retained }).toEqual({
			outcome: {
				kind: 'failure',
				message: 'A new item must be explicitly recreated to retain both copies'
			},
			retained: original
		});
	});
	it('stores the authoritative tombstone while retaining the offline edit', async () => {
		const { outbox, outboxWrites, cache } = setup();
		const input = draft();
		await outboxWrites.append('alice', input);
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected submitted edit');
		const remote = { kind: 'deleted' as const, etag: syncEtag(2n) };
		await outboxWrites.settle('alice', sent, { kind: 'conflict', remote });
		expect({
			local: (await outbox.list('alice'))[0].intent.local,
			records: (await cache.load('alice')).records
		}).toEqual({ local: input.local, records: [{ key: input.key, entry: remote }] });
	});
	it('persists a refreshed conflict alongside its authoritative server copy', async () => {
		const { outbox, outboxWrites, cache } = setup();
		const input = { ...draft(), base: { etag: syncEtag(1n), value: 'Original' } };
		await outboxWrites.append('alice', input);
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected queued edit');
		await outboxWrites.settle('alice', sent, { kind: 'conflict', remote: { kind: 'unavailable' } });
		await outboxWrites.resolveBase('alice', input.operationId, {
			kind: 'conflict',
			remote: { kind: 'found', snapshot }
		});
		expect({
			delivery: (await outbox.list('alice'))[0].delivery,
			records: (await cache.load('alice')).records
		}).toEqual({
			delivery: { kind: 'conflict', remote: { kind: 'found', snapshot } },
			records: [{ key: input.key, entry: { kind: 'present', snapshot: snapshot } }]
		});
	});
});

describe('local write validation', () => {
	it('rejects invalid local input without poisoning the queue or consuming a sequence', async () => {
		const { outbox, outboxWrites } = setup();
		await outboxWrites
			.append('alice', { ...draft(), operationId: 'invalid' })
			.catch(() => ({ kind: 'failure' }));
		await outboxWrites.append('alice', draft());
		expect((await outbox.list('alice')).map((entry) => entry.sequence)).toEqual([1]);
	});
});

describe('durable acknowledgement ancestry', () => {
	it('joins a late edit from another connection to its exact acknowledgement despite a newer cache body', async () => {
		const { outboxWrites, cache, name } = setup();
		const first = draft();
		await outboxWrites.append('alice', first);
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected submitted write');
		const later = { ...draft('note:1', 'Later typing'), basedOn: first.operationId };
		await outboxWrites.settle('alice', sent, {
			kind: 'applied',
			receipt: { operationId: first.operationId, resource: { kind: 'found', snapshot } }
		});
		await cache.commit('alice', {
			put: [
				{
					key: first.key,
					entry: {
						kind: 'present',
						snapshot: { etag: syncEtag(2n), value: 'Other client' }
					}
				}
			],
			remove: []
		});
		const other = setup(name).outboxWrites;
		await other.append('alice', later);
		expect((await other.list('alice'))[0].intent.base).toEqual(snapshot);
	});
	it('retains the original base after a newer local acknowledgement replaces its proof', async () => {
		const { outbox, outboxWrites } = setup();
		const first = draft();
		await outboxWrites.append('alice', first);
		const sent = await outboxWrites.take('alice');
		if (!sent) throw new Error('Expected submitted write');
		await outboxWrites.settle('alice', sent, {
			kind: 'applied',
			receipt: { operationId: first.operationId, resource: { kind: 'found', snapshot } }
		});
		const second = { ...draft(), basedOn: first.operationId };
		await outboxWrites.append('alice', second);
		const next = await outboxWrites.take('alice');
		if (!next) throw new Error('Expected next submitted write');
		await outboxWrites.settle('alice', next, {
			kind: 'applied',
			receipt: {
				operationId: second.operationId,
				resource: { kind: 'found', snapshot: { etag: syncEtag(2n), value: 'Second edit' } }
			}
		});
		await outboxWrites.append('alice', { ...draft(), basedOn: first.operationId });
		expect((await outbox.list('alice'))[0].intent.base).toBeNull();
	});
});

it('retains a corrected rejected document as sendable after reopening storage', async () => {
	const { name, outbox, outboxWrites } = setup();
	const original = { ...draft('note:1', 'Invalid document'), base: snapshot, coalesce: 'document' };
	await outboxWrites.append('alice', original);
	const attempted = await outboxWrites.take('alice');
	if (!attempted) throw new Error('Expected a sendable document');
	await outboxWrites.settle('alice', attempted, {
		kind: 'rejected',
		message: 'Invalid document'
	});
	const correction = {
		...draft('note:1', 'Corrected document'),
		base: snapshot,
		basedOn: original.operationId,
		coalesce: 'document'
	};
	await outboxWrites.append('alice', correction);
	await outbox.close();
	const sent = await setup(name).outboxWrites.take('alice');
	expect({
		id: sent?.intent.operationId,
		command: sent?.intent.command,
		base: sent?.intent.base
	}).toEqual({ id: correction.operationId, command: 'Corrected document', base: snapshot });
});

outboxRepositoryContract(() => setup().outboxWrites);

it('retains identical normalized input for submission and uncertain cancellation', async () => {
	const { name } = setup();
	const project = projectBuilder({ name: 'Plan' });
	const outbox = new IndexedDbOutbox(
		workspaceCommandSchema,
		workspaceRecordSchema,
		new WorkspaceDatabase(project.userId, name)
	);
	const outboxWrites = createDurableOutbox(outbox, rebaseWorkspaceRecord);
	databases.add(outbox.database.name);
	repositories.push(outbox);
	const operationId = crypto.randomUUID();
	await outboxWrites.append(project.userId, {
		operationId,
		key: JSON.stringify(['projects', project.id]),
		command: { kind: 'createProject', id: project.id, name: 'Plan ' },
		local: { type: 'projects', value: project },
		base: null,
		basedOn: null,
		coalesce: null,
		references: []
	});
	const sent = await outboxWrites.take(project.userId);
	await outboxWrites.retry(project.userId, operationId, 'Response lost');
	await outbox.close();
	const reopened = new IndexedDbOutbox(
		workspaceCommandSchema,
		workspaceRecordSchema,
		new WorkspaceDatabase(project.userId, name)
	);
	repositories.push(reopened);
	const [retained] = await reopened.list(project.userId);
	expect({ submitted: sent?.intent.command, cancelled: retained.intent.command }).toEqual({
		submitted: { kind: 'createProject', id: project.id, name: 'Plan' },
		cancelled: { kind: 'createProject', id: project.id, name: 'Plan' }
	});
});

it('requeues a widget tick replayed onto a tick of another item, with its change unchanged', async () => {
	const { name } = setup();
	const items = widgetTemplates.checklist.data.items;
	const widget = (done: readonly boolean[]) =>
		widgetBuilder({
			data: {
				...widgetTemplates.checklist.data,
				items: items.map((item, index) => ({ ...item, done: done[index] ?? false }))
			}
		});
	const original = widget([]);
	const outbox = new IndexedDbOutbox(
		workspaceCommandSchema,
		workspaceRecordSchema,
		new WorkspaceDatabase(original.userId, name)
	);
	const outboxWrites = createDurableOutbox(outbox, rebaseWorkspaceRecord);
	databases.add(outbox.database.name);
	repositories.push(outbox);
	const change = {
		kind: 'data' as const,
		patch: [{ op: 'replace' as const, path: '/items/0/done', value: true }]
	};
	await outboxWrites.append(original.userId, {
		operationId: crypto.randomUUID(),
		key: JSON.stringify(['widgets', original.id]),
		command: { kind: 'editWidget', widgetId: original.id, change },
		local: { type: 'widgets', value: { ...widget([true]), dataRevision: 2 } },
		base: { etag: syncEtag(1n), value: { type: 'widgets', value: original } },
		basedOn: null,
		coalesce: null,
		references: []
	});
	const sent = await outboxWrites.take(original.userId);
	if (!sent) throw new Error('Expected the submitted widget edit');
	await outboxWrites.settle(original.userId, sent, {
		kind: 'conflict',
		remote: {
			kind: 'found',
			snapshot: {
				etag: syncEtag(2n),
				value: { type: 'widgets', value: { ...widget([false, true]), dataRevision: 2 } }
			}
		}
	});
	const [entry] = await outbox.list(original.userId);
	expect({
		delivery: entry.delivery,
		command: entry.intent.command,
		local: entry.intent.local?.type === 'widgets' && entry.intent.local.value.data
	}).toEqual({
		delivery: { kind: 'queued' },
		command: { kind: 'editWidget', widgetId: original.id, change },
		local: widget([true, true]).data
	});
});
