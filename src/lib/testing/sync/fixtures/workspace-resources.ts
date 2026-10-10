import { rebaseWorkspaceRecord } from '$lib/controllers/workspace/rebase';
import { createResourceCache } from '$lib/factories/sync/cache';
import { createMutationQueue } from '$lib/factories/sync/submission';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { InMemorySyncCache, InMemorySyncTransport } from '../fakes/in-memory-sync';
import { InMemoryOutbox, InMemoryAccountWriterLock } from '../fakes/in-memory-outbox';
import { InMemorySyncScheduler } from '../fakes/in-memory-scheduler';

export const workspaceResourcesFixture = (accountId: string) => {
	const transport = new InMemorySyncTransport<WorkspaceRecord>();
	const repository = new InMemorySyncCache<WorkspaceRecord>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(
		rebaseWorkspaceRecord,
		repository
	);
	const cache = createResourceCache(accountId, { repository: outbox.projectedCache, transport });
	const { writes, execution } = createMutationQueue<WorkspaceCommand, WorkspaceRecord>(accountId, {
		repository: outbox,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: {
			send: async () => {
				throw new Error('This scenario does not submit edits');
			}
		},
		pull: () => cache.refresh()
	});
	const resources = new WorkspaceResources(accountId, {
		repository: outbox,
		cache,
		writes,
		execution
	});
	outbox.observe(accountId, (state) => resources.applyLocal(state));
	return {
		transport,
		cache,
		resources
	};
};
