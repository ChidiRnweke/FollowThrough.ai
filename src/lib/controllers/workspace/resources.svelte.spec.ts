import { workspaceRebase } from '$lib/factories/workspace/rebase';
const rebaseWorkspaceRecord = workspaceRebase.rebase;
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import type { OutboxTransport } from '$lib/client/sync/outbox-contracts';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import {
	type WorkspaceResourceIdentity,
	type WorkspaceResourceType
} from '$lib/models/workspace-sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import { initialSyncCursor } from '$lib/models/sync';
import { syncEtag } from '$lib/models/sync';
import {
	InMemorySyncCache,
	InMemorySyncTransport,
	InMemoryBatchSyncTransport
} from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { createResourceCache } from '$lib/factories/sync/cache';
import { createMutationQueue } from '$lib/factories/sync/submission';
import { assembleWorkspaceResources } from '$lib/factories/workspace/resources';
import type {
	WorkspaceResourcesController,
	ResourceViewController
} from '$lib/controllers/workspace/resources';

const project = workspaceRecordSchema.parse({
	type: 'projects',
	value: {
		id: 'a0000000-0000-4000-8000-000000000001',
		userId: 'a0000000-0000-4000-8000-000000000002',
		name: 'Local project',
		role: 'workspace',
		createdAt: '2026-09-07T10:00:00Z',
		updatedAt: '2026-09-07T10:00:00Z'
	}
});
const identity: WorkspaceResourceIdentity = {
	type: 'projects',
	id: ['a0000000-0000-4000-8000-000000000001']
};
const key = workspaceResourceKey(identity);
const activeResources: WorkspaceResourcesController[] = [];
afterEach(() => {
	for (const resources of activeResources.splice(0)) resources.stop();
});
const setup = async (
	writeTransport: OutboxTransport<WorkspaceCommand, typeof project> = {
		send: async () => {
			throw new Error('This test only reads local resources');
		}
	},
	transport = new InMemorySyncTransport<typeof project>()
) => {
	const repository = new InMemorySyncCache<typeof project>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, typeof project>(
		rebaseWorkspaceRecord,
		repository
	);
	const cache = createResourceCache('alice', { repository: outbox.projectedCache, transport });
	const { writes, execution } = createMutationQueue<WorkspaceCommand, typeof project>('alice', {
		repository: outbox,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: writeTransport,
		pull: () => cache.refresh()
	});
	const resources = assembleWorkspaceResources('alice', {
		repository: outbox,
		cache,
		writes,
		execution
	});
	activeResources.push(resources);
	return {
		outbox,
		writes,
		execution,
		repository,
		transport,
		cache,
		resources
	};
};

describe('shared workspace reads', () => {
	it('opens a locally created resource without a server round trip', async () => {
		const { resources, outbox } = await setup();
		if (project.type !== 'projects') throw new Error('Expected the project fixture');
		resources.setOnline(false);
		await outbox.append('alice', {
			operationId: 'a0000000-0000-4000-8000-000000000003',
			key,
			command: { kind: 'createProject', id: project.value.id, name: project.value.name },
			base: null,
			basedOn: null,
			local: project,
			coalesce: null,
			references: []
		});
		await resources.initialize();
		await outbox.read('alice');
		expect(await resources.open(identity)).toEqual({ kind: 'ready', value: project });
	});
	it('opens a retained resource while its newer page is downloading', async () => {
		const { resources, repository, transport, cache } = await setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: {
						kind: 'present',
						snapshot: { etag: syncEtag(1n), value: project }
					}
				}
			],
			remove: []
		});
		transport.records.set(key, { etag: syncEtag(2n), value: project });
		await resources.initialize();
		const paused = transport.pause('changes');
		const pulling = cache.refresh();
		await paused.started;
		const opened = await resources.open(identity);
		paused.release();
		await pulling;
		expect(opened).toEqual({ kind: 'ready', value: project });
	});
	it('does not wait for a retained collection body that is already refreshing', async () => {
		const { resources, repository, transport, cache } = await setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: {
						kind: 'present',
						snapshot: { etag: syncEtag(1n), value: project }
					}
				}
			],
			remove: []
		});
		transport.records.set(key, { etag: syncEtag(2n), value: project });
		await resources.initialize();
		const paused = transport.pause('changes');
		const warming = cache.refresh();
		await paused.started;
		await resources.prepare();
		const listed = resources.records.get(key);
		paused.release();
		await warming;
		expect(listed).toEqual(project);
	});
	it('downloads all records included in a complete page', async () => {
		const { resources, transport, cache } = await setup();
		const user = workspaceRecordSchema.parse({
			type: 'users',
			value: {
				id: 'a0000000-0000-4000-8000-000000000002',
				email: 'alice@example.test',
				displayName: 'Alice',
				role: 'USER',
				createdAt: '2026-09-07T10:00:00Z',
				updatedAt: '2026-09-07T10:00:00Z'
			}
		});
		const userKey = workspaceResourceKey({
			type: 'users',
			id: ['a0000000-0000-4000-8000-000000000002']
		});
		transport.records.set(key, { etag: syncEtag(1n), value: project });
		transport.records.set(userKey, { etag: syncEtag(2n), value: user });
		await resources.requireCollections();
		expect({ listed: resources.records.get(key), unrelated: cache.access(userKey) }).toEqual({
			listed: project,
			unrelated: { kind: 'ready', value: user }
		});
	});

	it('clears exposed records when the account stops', async () => {
		const { resources, repository } = await setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: {
						kind: 'present',
						snapshot: { etag: syncEtag(1n), value: project }
					}
				}
			],
			remove: []
		});
		await resources.initialize();
		resources.stop();
		expect([...resources.records]).toEqual([]);
	});
});

describe('a surface observing one record', async () => {
	const cached = async () => {
		const context = await setup();
		await context.repository.commit('alice', {
			put: [{ key, entry: { kind: 'present', snapshot: { etag: syncEtag(1n), value: project } } }],
			remove: []
		});
		await context.resources.initialize();
		return context;
	};
	const observed = (view: ResourceViewController<WorkspaceResourceType>) =>
		$effect.root(() => {
			$effect(() => {
				void view.state;
			});
		});
	it('opens a cached record without reading device storage again', async () => {
		const { resources, outbox } = await cached();
		outbox.snapshotFailure = 'Device storage was read';
		expect(await resources.open(identity)).toEqual({ kind: 'ready', value: project });
	});
	it('shows a cached record at once', async () => {
		const { resources } = await cached();
		expect(resources.view(identity).state).toEqual({ kind: 'ready', value: project.value });
	});
	it('downloads an uncached record once a surface observes it', async () => {
		const { resources, transport } = await setup();
		transport.records.set(key, { etag: syncEtag(1n), value: project });
		await resources.initialize();
		const view = resources.view(identity);
		const stop = observed(view);
		flushSync();
		await expect.poll(() => view.state).toEqual({ kind: 'ready', value: project.value });
		stop();
	});
	it('reports an uncached record as unavailable offline', async () => {
		const { resources } = await setup();
		await resources.initialize();
		resources.setOnline(false);
		expect(resources.view(identity).state).toEqual({ kind: 'unavailable' });
	});
	it('reports a record the server does not have as unavailable', async () => {
		const { resources } = await setup();
		await resources.initialize();
		const view = resources.view(identity);
		const stop = observed(view);
		flushSync();
		await expect.poll(() => view.state).toEqual({ kind: 'unavailable' });
		stop();
	});
	it('reports a failed download', async () => {
		const { resources, transport } = await setup();
		transport.readFailure = 'Server down';
		await resources.initialize();
		const view = resources.view(identity);
		const stop = observed(view);
		flushSync();
		await expect.poll(() => view.state).toEqual({ kind: 'failure', message: 'Server down' });
		stop();
	});
	it('recovers a failed download on retry', async () => {
		const { resources, transport } = await setup();
		transport.readFailure = 'Server down';
		transport.records.set(key, { etag: syncEtag(1n), value: project });
		await resources.initialize();
		const view = resources.view(identity);
		await view.retry();
		transport.readFailure = null;
		await view.retry();
		expect(view.state).toEqual({ kind: 'ready', value: project.value });
	});
	it('reports a server deletion', async () => {
		const { resources, repository } = await setup();
		await repository.commit('alice', {
			put: [{ key, entry: { kind: 'deleted', etag: syncEtag(2n) } }],
			remove: []
		});
		await resources.initialize();
		expect(resources.view(identity).state).toEqual({ kind: 'deleted' });
	});
});

describe('shared editor context', () => {
	it('captures the original version before background refresh changes the cache', async () => {
		const { resources, cache } = await setup();
		const original = { etag: syncEtag(1n), value: project };
		await cache.accept(key, original);
		const draft = resources.draft(identity);
		await draft.read();
		resources.setOnline(false);
		await cache.accept(key, { etag: syncEtag(2n), value: project });
		if (project.type !== 'projects') throw new Error('Expected project');
		await draft.stage({ kind: 'renameProject', projectId: project.value.id, name: 'Changed' });
		expect(resources.pending[0].intent.base).toEqual(original);
	});
	it('captures pending local ancestry separately from the server base', async () => {
		const { resources, outbox } = await setup();
		resources.setOnline(false);
		if (project.type !== 'projects') throw new Error('Expected project');
		const id = await outbox.append('alice', {
			operationId: crypto.randomUUID(),
			key,
			command: { kind: 'createProject', id: project.value.id, name: project.value.name },
			base: null,
			basedOn: null,
			local: project,
			coalesce: null,
			references: []
		});
		await resources.initialize();
		await outbox.read('alice');
		await resources.initialize();
		await outbox.read('alice');
		const draft = resources.draft(identity);
		await draft.read();
		await draft.stage({ kind: 'renameProject', projectId: project.value.id, name: 'Changed' });
		expect(resources.pending.at(-1)?.intent).toMatchObject({ base: null, basedOn: id });
	});
	it('submits edits appended after the write phase while a background page is still downloading', async () => {
		if (project.type !== 'projects') throw new Error('Expected project');
		const saved = { ...project, value: { ...project.value, name: 'Edited' } };
		const { resources, cache, transport } = await setup({
			send: async (input) => {
				const snapshot = { etag: syncEtag(3n), value: saved };
				transport.records.set(key, snapshot);
				return {
					kind: 'applied',
					receipt: { operationId: input.operationId, resource: { kind: 'found', snapshot } }
				};
			}
		});
		await cache.accept(key, { etag: syncEtag(1n), value: project });
		await resources.initialize();
		transport.records.set(key, { etag: syncEtag(2n), value: project });
		const paused = transport.pause('changes');
		const syncing = resources.synchronize();
		await paused.started;
		const draft = resources.draft(identity);
		await draft.read();
		await draft.stage({ kind: 'renameProject', projectId: project.value.id, name: 'Edited' });
		paused.release();
		await syncing;
		expect({ pending: resources.pending, value: resources.records.get(key) }).toEqual({
			pending: [],
			value: saved
		});
	});
});

describe('optional workspace records', () => {
	it('reports absence after an initial successful journal pull', async () => {
		const { resources } = await setup();
		expect(await resources.lookup(identity)).toEqual({ kind: 'absent' });
	});
	it('does not invent absence before this device has a journal', async () => {
		const { resources } = await setup();
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'unavailable' });
	});
	it('retains a journal failure instead of supplying defaults', async () => {
		const { resources, transport } = await setup();
		transport.pullFailure = 'Connection interrupted';
		expect(await resources.lookup(identity)).toEqual({
			kind: 'failure',
			message: 'Connection interrupted'
		});
	});
	it('uses known absence offline', async () => {
		const { resources, repository } = await setup();
		await repository.commit('alice', { put: [], remove: [], cursor: initialSyncCursor });
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'absent' });
	});
	it('keeps an unfinished inventory distinct from known absence', async () => {
		const { resources, repository } = await setup();
		await repository.commit('alice', {
			put: [],
			inventoryComplete: false,
			remove: [],
			cursor: initialSyncCursor
		});
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'unavailable' });
	});
	it('keeps server deletion distinct from absence', async () => {
		const { resources, repository } = await setup();
		await repository.commit('alice', {
			put: [{ key, entry: { kind: 'deleted', etag: syncEtag(1n) } }],
			remove: [],
			cursor: initialSyncCursor
		});
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'deleted' });
	});
});

describe('drafting optional resources', async () => {
	it('uses initial values only after a completed journal proves absence', async () => {
		const { resources, repository } = await setup();
		await repository.commit('alice', { put: [], remove: [], cursor: initialSyncCursor });
		resources.setOnline(false);
		const draft = resources.draft({ type: 'projects', id: identity.id });
		expect(await draft.readOrCreate(project)).toEqual({ kind: 'ready', value: project.value });
	});
	it('does not turn an unknown offline inventory into a writable default', async () => {
		const { resources } = await setup();
		resources.setOnline(false);
		const draft = resources.draft({ type: 'projects', id: identity.id });
		expect(await draft.readOrCreate(project)).toEqual({ kind: 'unavailable' });
	});
	it('retains the existing body instead of replacing it with initial values', async () => {
		const { resources, repository } = await setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: {
						kind: 'present',
						snapshot: { etag: syncEtag(1n), value: project }
					}
				}
			],
			remove: [],
			cursor: initialSyncCursor
		});
		resources.setOnline(false);
		if (project.type !== 'projects') throw new Error('Expected the project fixture');
		const draft = resources.draft({ type: 'projects', id: identity.id });
		expect(
			await draft.readOrCreate({ type: 'projects', value: { ...project.value, name: 'Default' } })
		).toEqual({ kind: 'ready', value: project.value });
	});
});

it('can explicitly draft a new override after its server tombstone', async () => {
	const { resources, repository } = await setup();
	await repository.commit('alice', {
		put: [{ key, entry: { kind: 'deleted', etag: syncEtag(1n) } }],
		remove: [],
		cursor: initialSyncCursor
	});
	resources.setOnline(false);
	const draft = resources.draft({ type: 'projects', id: identity.id });
	await draft.readOrCreate(project);
	expect(draft.value).toEqual(project.value);
});

it('does not replace a failed known resource read with writable initial values', async () => {
	const { resources, transport } = await setup();
	transport.records.set(key, { etag: syncEtag(1n), value: project });
	transport.pullFailure = 'Download failed';
	const draft = resources.draft({ type: 'projects', id: identity.id });
	expect(await draft.readOrCreate(project)).toEqual({
		kind: 'failure',
		message: 'Download failed'
	});
});

it('refuses to capture an optional default before the inventory is known', async () => {
	const { resources } = await setup();
	const draft = resources.draft({ type: 'projects', id: identity.id });
	expect(() => draft.captureOrCreate(project)).toThrow('not available');
});

it('captures a known absent optional resource without starting a server read', async () => {
	const { resources, repository } = await setup();
	await repository.commit('alice', { put: [], remove: [], cursor: initialSyncCursor });
	await resources.initialize();
	const draft = resources.draft({ type: 'projects', id: identity.id });
	draft.captureOrCreate(project);
	expect(draft.value).toEqual(project.value);
});

it('keeps the displayed base when capturing an optional resource already refreshing', async () => {
	const { resources, repository } = await setup();
	await repository.commit('alice', {
		put: [
			{
				key,
				entry: { kind: 'present', snapshot: { etag: syncEtag(1n), value: project } }
			}
		],
		remove: [],
		cursor: initialSyncCursor
	});
	await resources.initialize();
	const draft = resources.draft({ type: 'projects', id: identity.id });
	draft.captureOrCreate(project);
	if (project.type !== 'projects') throw new Error('Expected project');
	const saved = await draft.stage({
		kind: 'renameProject',
		projectId: project.value.id,
		name: 'Changed'
	});
	if (saved.kind !== 'saved') throw new Error(saved.message);
	expect(resources.pending[0]?.intent.base?.etag).toEqual(syncEtag(1n));
});

it('refuses an optional default before inventory proves absence', async () => {
	const { resources, repository } = await setup();
	await repository.commit('alice', {
		put: [],
		inventoryComplete: false,
		remove: [],
		cursor: initialSyncCursor
	});
	await resources.initialize();
	const draft = resources.draft({ type: 'projects', id: identity.id });
	expect(() => draft.captureOrCreate(project)).toThrow('not available');
});

it('does not adopt a new conflict base when an editor read has been superseded', async () => {
	const { resources, repository, transport } = await setup();
	await repository.commit('alice', {
		put: [
			{
				key,
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(1n), value: project }
				}
			}
		],
		remove: [],
		cursor: initialSyncCursor
	});
	await resources.initialize();
	const draft = resources.draft({ type: 'projects', id: identity.id });
	draft.capture();
	transport.records.set(key, { etag: syncEtag(2n), value: project });
	await resources.synchronize();
	await draft.read(() => false);
	if (project.type !== 'projects') throw new Error('Expected project');
	const saved = await draft.stage({
		kind: 'renameProject',
		projectId: project.value.id,
		name: 'Later typing'
	});
	if (saved.kind !== 'saved') throw new Error(saved.message);
	expect(resources.pending[0]?.intent.base?.etag).toEqual(syncEtag(1n));
});

// SYNC-DOWNLOAD: preparation obeys the same transport budget as warming.
it('prepares a complete collection within the batch transport capacity', async () => {
	const transport = new InMemoryBatchSyncTransport<typeof project>();
	transport.maxConcurrentReads = 32;
	const { resources } = await setup(undefined, transport);
	const expected: [string, typeof project][] = [];
	for (let index = 0; index < 70; index++) {
		const id = crypto.randomUUID();
		const record = workspaceRecordSchema.parse({
			type: 'projects',
			value: { ...project.value, id, name: `Project ${index}` }
		});
		const key = workspaceResourceKey({ type: 'projects', id: [id] });
		expected.push([key, structuredClone(record)]);
		transport.records.set(key, {
			etag: syncEtag(BigInt(index + 1)),
			value: record
		});
	}
	await resources.requireCollections();
	const byKey = (records: readonly [string, typeof project][]) =>
		[...records].sort(([left], [right]) => left.localeCompare(right));
	expect(byKey([...resources.records])).toEqual(byKey(expected));
});

// SYNC-READINESS: unrelated missing bodies cannot disable an available collection.
it('marks an empty collection ready after its full inventory arrives', async () => {
	const { resources, transport } = await setup();
	transport.records.set(key, { etag: syncEtag(1n), value: project });
	await resources.requireCollections();
	expect(resources.collectionReadiness()).toBe('ready');
});

it('downloads authoritative records while an unrelated submission is stalled', async () => {
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const { resources, outbox, transport } = await setup({
		send: async (input) => {
			entered.resolve();
			await release.promise;
			return {
				kind: 'applied',
				receipt: {
					operationId: input.operationId,
					resource: { kind: 'found', snapshot: { etag: syncEtag(2n), value: project } }
				}
			};
		}
	});
	if (project.type !== 'projects') throw new Error('Expected project');
	resources.setOnline(false);
	await outbox.append('alice', {
		operationId: crypto.randomUUID(),
		key,
		command: { kind: 'createProject', id: project.value.id, name: project.value.name },
		base: null,
		basedOn: null,
		local: project,
		coalesce: null,
		references: []
	});
	await resources.initialize();
	await outbox.read('alice');
	await resources.synchronize();
	const otherId = crypto.randomUUID();
	const otherKey = workspaceResourceKey({ type: 'projects', id: [otherId] });
	transport.records.set(otherKey, {
		etag: syncEtag(1n),
		value: workspaceRecordSchema.parse({
			type: 'projects',
			value: { ...project.value, id: otherId }
		})
	});
	resources.setOnline(true);
	const synchronizing = resources.synchronize();
	await entered.promise;
	try {
		await expect.poll(() => resources.records.has(otherKey), { timeout: 500 }).toBe(true);
	} finally {
		release.resolve();
		await synchronizing;
		resources.stop();
	}
});

it('reports the transport failure when required inventory cannot load', async () => {
	const { resources, transport } = await setup();
	transport.records.set(key, { etag: syncEtag(1n), value: project });
	transport.pullFailure = 'Disconnected';
	await expect(resources.requireCollections()).rejects.toThrow('Disconnected');
});

it('does not create a default while an unknown resource is being downloaded', async () => {
	const { resources, cache, transport } = await setup();
	await cache.initialize();
	const paused = transport.pause(key);
	const opening = cache.open(key);
	await paused.started;
	const draft = resources.draft({ type: 'projects', id: identity.id });
	try {
		expect(() => draft.captureOrCreate(project)).toThrow('not available');
	} finally {
		paused.release();
		await opening;
	}
});

it('keeps a created resource visible until its complete settled projection arrives', async () => {
	const { resources, outbox, writes } = await setup();
	if (project.type !== 'projects') throw new Error('Expected project fixture');
	resources.setOnline(false);
	await outbox.append('alice', {
		operationId: crypto.randomUUID(),
		key,
		command: { kind: 'createProject', id: project.value.id, name: project.value.name },
		local: project,
		base: null,
		basedOn: null,
		coalesce: null,
		references: []
	});
	await resources.initialize();
	await outbox.read('alice');
	outbox.pauseObservations();
	const sent = await outbox.take('alice');
	if (!sent) throw new Error('The created project was not queued');
	await outbox.settle('alice', sent, {
		kind: 'applied',
		receipt: {
			operationId: sent.intent.operationId,
			resource: { kind: 'found', snapshot: { etag: syncEtag(2n), value: project } }
		}
	});
	await writes.reload();
	const beforePublication = resources.records.get(key);
	outbox.resumeObservations();
	await resources.initialize();
	await outbox.read('alice');
	expect([beforePublication, resources.records.get(key)]).toEqual([project, project]);
});
