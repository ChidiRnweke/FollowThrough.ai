import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { InMemorySyncCache, InMemorySyncTransport } from '../fakes/in-memory-sync';
import { InMemoryOutbox, InMemoryAccountWriterLock } from '../fakes/in-memory-outbox';
import { InMemorySyncScheduler } from '../fakes/in-memory-scheduler';

export const workspaceResourcesFixture = (accountId: string) => {
	const transport = new InMemorySyncTransport<WorkspaceRecord>();
	const repository = new InMemorySyncCache<WorkspaceRecord>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(repository);
	const cache = new ResourceCache(accountId, { repository: outbox.projectedCache, transport });
	const writes = new MutationQueue<WorkspaceCommand, WorkspaceRecord>(accountId, {
		repository: outbox,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: {
			send: async () => {
				throw new Error('This scenario does not submit edits');
			}
		},
		resolveBase: async () => {
			throw new Error('This scenario has no imported edits');
		},
		committed: () => resources.committed()
	});
	const resources = new WorkspaceResources(accountId, {
		scheduler: new InMemorySyncScheduler(),
		cache,
		writes,
		restoreLocalWrites: async () => undefined
	});
	outbox.observe(accountId, (state) => resources.applyLocal(state));
	return {
		transport,
		cache,
		resources
	};
};
