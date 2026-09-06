import { describe, expect, it } from 'vitest';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
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
const setup = () => {
	const repository = new InMemorySyncCache<typeof project>();
	const transport = new InMemorySyncTransport<typeof project>();
	const cache = new ResourceCache('alice', { repository, transport });
	const writes = new MutationQueue<WorkspaceCommand, typeof project>('alice', {
		repository: new InMemoryOutbox(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: {
			send: async () => {
				throw new Error('This test only reads local resources');
			}
		},
		accepted: async (key, receipt) => {
			const resource = receipt.resource;
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
