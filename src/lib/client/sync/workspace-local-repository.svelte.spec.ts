import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { cachedSnapshot, syncEtag } from '$lib/models/sync';
import { requestValue } from './database';
import {
	DexieWorkspaceRepository,
	type WorkspaceLocalProjection
} from './workspace-local-repository';

const names = new Set<string>();
const repositories: DexieWorkspaceRepository<string, string>[] = [];
const subscriptions: (() => void)[] = [];
const setup = () => {
	const name = `workspace-observation-${crypto.randomUUID()}`;

	const writer = new DexieWorkspaceRepository('alice', z.string(), z.string(), name);
	const follower = new DexieWorkspaceRepository('alice', z.string(), z.string(), name);
	names.add(writer.database.name);
	repositories.push(writer, follower);
	return { writer, follower, name };
};
afterEach(async () => {
	for (const stop of subscriptions.splice(0)) stop();
	for (const repository of repositories.splice(0)) await repository.close();
	for (const name of names) await requestValue(indexedDB.deleteDatabase(name));
	names.clear();
});

const body = (projection: WorkspaceLocalProjection<string, string>) => {
	const record = projection.cache.records.find((row) => row.key === 'note:1');
	return record?.entry.kind === 'present' ? cachedSnapshot(record.entry)?.value : undefined;
};
const saveBody = (
	repository: DexieWorkspaceRepository<string, string>,
	version: bigint,
	value: string
) =>
	repository.cache.commit('alice', {
		put: [
			{
				key: 'note:1',
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(version), value }
				}
			}
		],
		remove: []
	});

it('observes a body replacement from another connection even when the record count stays unchanged', async () => {
	const { writer, follower } = setup();
	await saveBody(writer, 1n, 'Original');
	const initial = Promise.withResolvers<void>();
	const changed = Promise.withResolvers<string>();
	subscriptions.push(
		follower.observe(
			'alice',
			(projection) => {
				const value = body(projection);
				if (value === 'Original') initial.resolve();
				if (value === 'Changed') changed.resolve(value);
			},
			(error) => {
				initial.reject(error);
				changed.reject(error);
			}
		)
	);
	await initial.promise;
	await saveBody(writer, 2n, 'Changed');
	expect(await changed.promise).toBe('Changed');
});

it('observes settlement as one coherent body, queue and exact receipt projection across connections', async () => {
	const { writer, follower } = setup();
	const operationId = crypto.randomUUID();
	await writer.append('alice', {
		operationId,
		key: 'note:1',
		command: 'create',
		base: null,
		basedOn: null,
		local: 'My draft',
		references: [],
		coalesce: null
	});
	const initial = Promise.withResolvers<void>();
	const settled = Promise.withResolvers<void>();
	const observed: {
		body: string | undefined;
		pending: readonly string[];
		receipt: string | undefined;
	}[] = [];
	subscriptions.push(
		follower.observe(
			'alice',
			(projection) => {
				const state = {
					body: body(projection),
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
	const sent = await writer.take('alice');
	if (!sent) throw new Error('The staged edit was not eligible');
	await writer.settle('alice', sent, {
		kind: 'applied',
		receipt: {
			operationId,
			resource: { kind: 'found', snapshot: { etag: syncEtag(1n), value: 'Saved' } }
		}
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

it('leaves a healthy observed projection idle until durable data changes', async () => {
	const { writer, follower } = setup();
	await saveBody(writer, 1n, 'Original');
	await writer.read('alice');
	const ready = Promise.withResolvers<void>();
	const observed: (string | undefined)[] = [];
	subscriptions.push(
		follower.observe(
			'alice',
			(projection) => {
				observed.push(body(projection));
				ready.resolve();
			},
			ready.reject
		)
	);
	await ready.promise;
	// Allow live-query invalidations and repairing reads to finish several browser task turns.
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(observed).toEqual(['Original']);
});

it('never publishes another account’s projection to an existing account observer', async () => {
	const { writer, follower, name } = setup();
	const bob = new DexieWorkspaceRepository('bob', z.string(), z.string(), name);
	repositories.push(bob);
	names.add(bob.database.name);
	await saveBody(writer, 1n, 'Alice private note');
	await bob.cache.commit('bob', {
		put: [
			{
				key: 'note:1',
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(2n), value: 'Bob private note' }
				}
			}
		],
		remove: []
	});
	await writer.read('alice');
	const ready = Promise.withResolvers<void>();
	const observed: (string | undefined)[] = [];
	subscriptions.push(
		follower.observe(
			'alice',
			(projection) => {
				observed.push(body(projection));
				ready.resolve();
			},
			ready.reject
		)
	);
	await ready.promise;
	await bob.read('bob');
	// Bob's head initialization must also leave Alice's live query unchanged.
	await new Promise((resolve) => setTimeout(resolve, 30));
	expect(observed).toEqual(['Alice private note']);
});

it('reads a complete rich-content page while its live projection is active', async () => {
	const { writer, follower } = setup();
	const observed = Promise.withResolvers<number>();
	subscriptions.push(
		follower.observe(
			'alice',
			(projection) => {
				if (projection.cache.records.length === 32)
					observed.resolve(projection.cache.records.length);
			},
			observed.reject
		)
	);
	await writer.cache.commit('alice', {
		put: Array.from({ length: 32 }, (_, index) => ({
			key: `note:${index}`,
			entry: {
				kind: 'present' as const,
				snapshot: { etag: syncEtag(1n), value: 'Rich content paragraph. '.repeat(150) }
			}
		})),
		remove: []
	});
	expect({
		observed: await observed.promise,
		stored: (await follower.read('alice')).cache.records.length
	}).toEqual({ observed: 32, stored: 32 });
});
