import { IndexedDbStorageRecovery } from '$lib/client/sync/storage-recovery';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { describe, expect, it } from 'vitest';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import type { OutboxTransport } from '$lib/client/sync/outbox-contracts';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { syncEtag, initialSyncCursor } from '$lib/models/sync';
import {
	InMemorySyncCache,
	InMemorySyncTransport,
	InMemoryBatchSyncTransport
} from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from './resources.svelte';

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
const setup = (
	writeTransport: OutboxTransport<WorkspaceCommand, typeof project> = {
		send: async () => {
			throw new Error('This test only reads local resources');
		}
	},
	transport = new InMemorySyncTransport<typeof project>()
) => {
	const repository = new InMemorySyncCache<typeof project>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, typeof project>(repository);
	const cache = new ResourceCache('alice', { repository: outbox.projectedCache, transport });
	const writes = new MutationQueue<WorkspaceCommand, typeof project>('alice', {
		repository: outbox,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: writeTransport,
		resolveBase: async () => {
			throw new Error('This fixture has no imported draft');
		},
		committed: () => resources.committed()
	});
	const resources = new WorkspaceResources('alice', {
		recovery: new IndexedDbStorageRecovery(),
		scheduler: new InMemorySyncScheduler(),
		cache,
		writes,
		restoreLocalWrites: async () => undefined
	});
	outbox.observe('alice', (state) => resources.applyLocal(state));
	return {
		repository,
		transport,
		cache,
		resources
	};
};

describe('shared workspace reads', () => {
	it('opens a locally created resource without a server round trip', async () => {
		const { resources } = setup();
		if (project.type !== 'projects') throw new Error('Expected the project fixture');
		resources.setOnline(false);
		await resources.append({
			operationId: 'a0000000-0000-4000-8000-000000000003',
			key,
			command: { kind: 'createProject', id: project.value.id, name: project.value.name },
			base: null,
			basedOn: null,
			local: project,
			coalesce: null,
			references: []
		});
		expect(await resources.open(identity)).toEqual({ kind: 'ready', value: project });
	});
	it('renders a retained list value while an explicit open waits for the updating resource', async () => {
		const { resources, repository, transport, cache } = setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: {
						kind: 'present',
						etag: syncEtag(1n),
						body: { etag: syncEtag(1n), value: project }
					}
				}
			],
			remove: []
		});
		transport.records.set(key, { etag: syncEtag(2n), value: project });
		await resources.initialize();
		await cache.refresh();
		const paused = transport.pause(key);
		let opened = false;
		const opening = resources.open(identity).then((result) => {
			opened = true;
			return result;
		});
		await paused.started;
		const during = { listed: resources.records.get(key), opened };
		paused.release();
		await opening;
		expect(during).toEqual({ listed: project, opened: false });
	});
	it('does not wait for a retained collection body that is already refreshing', async () => {
		const { resources, repository, transport, cache } = setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: {
						kind: 'present',
						etag: syncEtag(1n),
						body: { etag: syncEtag(1n), value: project }
					}
				}
			],
			remove: []
		});
		transport.records.set(key, { etag: syncEtag(2n), value: project });
		await cache.refresh();
		const paused = transport.pause(key);
		const warming = cache.warm();
		await paused.started;
		await resources.prepare(['projects']);
		const listed = resources.records.get(key);
		paused.release();
		await warming;
		expect(listed).toEqual(project);
	});
	it('prepares missing collection bodies without downloading unrelated resource types', async () => {
		const { resources, transport, cache } = setup();
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
		await resources.prepare(['projects']);
		expect({ listed: resources.records.get(key), unrelated: cache.access(userKey) }).toEqual({
			listed: project,
			unrelated: { kind: 'wait' }
		});
	});

	it('clears exposed records when the account stops', async () => {
		const { resources, repository } = setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: {
						kind: 'present',
						etag: syncEtag(1n),
						body: { etag: syncEtag(1n), value: project }
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

describe('shared editor context', () => {
	it('captures the original version before background refresh changes the cache', async () => {
		const { resources, cache } = setup();
		const original = { etag: syncEtag(1n), value: project };
		await cache.accept(key, original);
		const context = resources.editBase(identity);
		await cache.accept(key, { etag: syncEtag(2n), value: project });
		expect(context).toEqual({ base: original, basedOn: null, local: project });
	});
	it('captures pending local ancestry separately from the server base', async () => {
		const { resources } = setup();
		resources.setOnline(false);
		if (project.type !== 'projects') throw new Error('Expected project');
		const id = await resources.append({
			operationId: crypto.randomUUID(),
			key,
			command: { kind: 'createProject', id: project.value.id, name: project.value.name },
			base: null,
			basedOn: null,
			local: project,
			coalesce: null,
			references: []
		});
		expect(resources.editBase(identity)).toEqual({ base: null, basedOn: id, local: project });
	});
	it('submits edits appended after the write phase while background warming is still running', async () => {
		if (project.type !== 'projects') throw new Error('Expected project');
		const saved = { ...project, value: { ...project.value, name: 'Edited' } };
		const { resources, cache, transport } = setup({
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
		transport.records.set(key, { etag: syncEtag(2n), value: project });
		const paused = transport.pause(key);
		const syncing = resources.synchronize();
		await paused.started;
		await resources.append({
			operationId: crypto.randomUUID(),
			key,
			command: { kind: 'renameProject', projectId: project.value.id, name: 'Edited' },
			base: { etag: syncEtag(1n), value: project },
			basedOn: null,
			local: saved,
			coalesce: null,
			references: []
		});
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
		const { resources } = setup();
		expect(await resources.lookup(identity)).toEqual({ kind: 'absent' });
	});
	it('does not invent absence before this device has a journal', async () => {
		const { resources } = setup();
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'unavailable' });
	});
	it('retains a journal failure instead of supplying defaults', async () => {
		const { resources, transport } = setup();
		transport.pullFailure = 'Connection interrupted';
		expect(await resources.lookup(identity)).toEqual({
			kind: 'failure',
			message: 'Connection interrupted'
		});
	});
	it('uses known absence offline', async () => {
		const { resources, repository } = setup();
		await repository.commit('alice', { put: [], remove: [], cursor: initialSyncCursor });
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'absent' });
	});
	it('keeps a missing body distinct from an absent record', async () => {
		const { resources, repository } = setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: { kind: 'present', etag: syncEtag(1n), body: null }
				}
			],
			remove: [],
			cursor: initialSyncCursor
		});
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'unavailable' });
	});
	it('keeps server deletion distinct from absence', async () => {
		const { resources, repository } = setup();
		await repository.commit('alice', {
			put: [{ key, entry: { kind: 'deleted', etag: syncEtag(1n) } }],
			remove: [],
			cursor: initialSyncCursor
		});
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'deleted' });
	});
});

describe('drafting optional resources', () => {
	it('uses initial values only after a completed journal proves absence', async () => {
		const { resources, repository } = setup();
		await repository.commit('alice', { put: [], remove: [], cursor: initialSyncCursor });
		resources.setOnline(false);
		const draft = resources.draft({ type: 'projects', id: identity.id });
		expect(await draft.readOrCreate(project)).toEqual({ kind: 'ready', value: project.value });
	});
	it('does not turn an unknown offline inventory into a writable default', async () => {
		const { resources } = setup();
		resources.setOnline(false);
		const draft = resources.draft({ type: 'projects', id: identity.id });
		expect(await draft.readOrCreate(project)).toEqual({ kind: 'unavailable' });
	});
	it('retains the existing body instead of replacing it with initial values', async () => {
		const { resources, repository } = setup();
		await repository.commit('alice', {
			put: [
				{
					key,
					entry: {
						kind: 'present',
						etag: syncEtag(1n),
						body: { etag: syncEtag(1n), value: project }
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
	const { resources, repository } = setup();
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
	const { resources, transport } = setup();
	transport.records.set(key, { etag: syncEtag(1n), value: project });
	transport.readFailure = 'Download failed';
	const draft = resources.draft({ type: 'projects', id: identity.id });
	expect(await draft.readOrCreate(project)).toEqual({
		kind: 'failure',
		message: 'Download failed'
	});
});

it('refuses to capture an optional default before the inventory is known', () => {
	const { resources } = setup();
	const draft = resources.draft({ type: 'projects', id: identity.id });
	expect(() => draft.captureOrCreate(project)).toThrow('not available');
});

it('captures a known absent optional resource without starting a server read', async () => {
	const { resources, repository } = setup();
	await repository.commit('alice', { put: [], remove: [], cursor: initialSyncCursor });
	await resources.initialize();
	const draft = resources.draft({ type: 'projects', id: identity.id });
	draft.captureOrCreate(project);
	expect(draft.value).toEqual(project.value);
});

it('keeps the displayed base when capturing an optional resource already refreshing', async () => {
	const { resources, repository } = setup();
	await repository.commit('alice', {
		put: [
			{
				key,
				entry: { kind: 'present', etag: syncEtag(2n), body: { etag: syncEtag(1n), value: project } }
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
		command: { kind: 'renameProject', projectId: project.value.id, name: 'Changed' },
		local: project,
		coalesce: null,
		references: []
	});
	if (saved.kind !== 'saved') throw new Error(saved.message);
	expect(resources.pending[0]?.intent.base?.etag).toEqual(syncEtag(1n));
});

it('refuses an optional default when a known resource has no downloaded body', async () => {
	const { resources, repository } = setup();
	await repository.commit('alice', {
		put: [
			{
				key,
				entry: { kind: 'present', etag: syncEtag(1n), body: null }
			}
		],
		remove: [],
		cursor: initialSyncCursor
	});
	await resources.initialize();
	const draft = resources.draft({ type: 'projects', id: identity.id });
	expect(() => draft.captureOrCreate(project)).toThrow('Open the resource');
});

it('does not adopt a new conflict base when an editor read has been superseded', async () => {
	const { resources, repository, transport } = setup();
	await repository.commit('alice', {
		put: [
			{
				key,
				entry: {
					kind: 'present',
					etag: syncEtag(1n),
					body: { etag: syncEtag(1n), value: project }
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
		command: { kind: 'renameProject', projectId: project.value.id, name: 'Later typing' },
		local: project,
		coalesce: null,
		references: []
	});
	if (saved.kind !== 'saved') throw new Error(saved.message);
	expect(resources.pending[0]?.intent.base?.etag).toEqual(syncEtag(1n));
});

// SYNC-DOWNLOAD: preparation obeys the same transport budget as warming.
it('prepares a complete collection within the batch transport capacity', async () => {
	const transport = new InMemoryBatchSyncTransport<typeof project>();
	transport.maxConcurrentReads = 32;
	const { resources } = setup(undefined, transport);
	for (let index = 0; index < 70; index++) {
		const id = crypto.randomUUID();
		const record = workspaceRecordSchema.parse({
			type: 'projects',
			value: { ...project.value, id }
		});
		transport.records.set(workspaceResourceKey({ type: 'projects', id: [id] }), {
			etag: syncEtag(BigInt(index + 1)),
			value: record
		});
	}
	await resources.prepare(['projects']);
	expect(resources.records.size).toBe(70);
});

// SYNC-READINESS: unrelated missing bodies cannot disable an available collection.
it('makes a known empty collection ready while an unrelated body is unavailable', async () => {
	const { resources, transport } = setup();
	transport.records.set(key, { etag: syncEtag(1n), value: project });
	transport.readFailure = 'Unavailable project body';
	await resources.prepare(['projects']);
	expect(resources.collectionReadiness(['attachments', 'attachment_versions'])).toBe('ready');
});

it('downloads authoritative records while an unrelated submission is stalled', async () => {
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const { resources, transport } = setup({
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
	await resources.append({
		operationId: crypto.randomUUID(),
		key,
		command: { kind: 'createProject', id: project.value.id, name: project.value.name },
		base: null,
		basedOn: null,
		local: project,
		coalesce: null,
		references: []
	});
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

it('does not publish required collection readiness when its initial body failed', async () => {
	const { resources, transport } = setup();
	transport.records.set(key, { etag: syncEtag(1n), value: project });
	transport.readFailure = 'Disconnected';
	await expect(resources.requireCollections(['projects'])).rejects.toThrow(
		'Required workspace data is not available on this device'
	);
});

it('does not treat an admitted download as permission to create a default', async () => {
	const { resources, cache, transport } = setup();
	await cache.refresh();
	const paused = transport.pause(key);
	const opening = cache.open(key);
	await paused.started;
	const draft = resources.draft({ type: 'projects', id: identity.id });
	try {
		expect(() => draft.captureOrCreate(project)).toThrow('Open the resource before editing it');
	} finally {
		paused.release();
		await opening;
	}
});
