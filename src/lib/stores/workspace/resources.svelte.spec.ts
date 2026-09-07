import { describe, expect, it } from 'vitest';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import type { OutboxTransport } from '$lib/client/sync/outbox-contracts';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
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
	}
) => {
	const repository = new InMemorySyncCache<typeof project>();
	const transport = new InMemorySyncTransport<typeof project>();
	const cache = new ResourceCache('alice', { repository, transport });
	const writes = new MutationQueue<WorkspaceCommand, typeof project>('alice', {
		repository: new InMemoryOutbox(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: writeTransport,
		resolveBase: async () => {
			throw new Error('This fixture has no imported draft');
		},
		received: async (key, resource) => {
			await cache.accept(key, resource.kind === 'found' ? resource.snapshot : resource);
		}
	});
	return {
		repository,
		transport,
		cache,
		resources: new WorkspaceResources('alice', { cache, writes })
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
						cache: { kind: 'cached', snapshot: { etag: syncEtag(1n), value: project } }
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
						cache: { kind: 'cached', snapshot: { etag: syncEtag(1n), value: project } }
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
						cache: { kind: 'cached', snapshot: { etag: syncEtag(1n), value: project } }
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
