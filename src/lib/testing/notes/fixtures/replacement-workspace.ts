import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import {
	noteBuilder,
	projectBuilder,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

export async function replacementWorkspace() {
	const account = 'replacement-fixture';
	const repository = new InMemorySyncCache<WorkspaceRecord>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(repository);
	const cache = new ResourceCache(account, {
		repository: outbox.projectedCache,
		transport: new InMemorySyncTransport<WorkspaceRecord>()
	});
	const writes = new MutationQueue<WorkspaceCommand, WorkspaceRecord>(account, {
		repository: outbox,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: {
			send: async () => {
				throw new Error('The fixture must stay offline');
			}
		},
		pull: () => cache.refresh()
	});
	const resources = new WorkspaceResources(account, { repository: outbox, cache, writes });
	resources.setOnline(false);
	const stopObserving = outbox.observe(account, (state) => resources.applyLocal(state));
	const project = projectBuilder();
	await repository.commit(account, {
		put: [
			{
				key: workspaceResourceKey({ type: 'projects', id: [project.id] }),
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(1n), value: { type: 'projects', value: project } }
				}
			}
		],
		remove: []
	});
	await repository.commit(account, {
		put: [1, 2, 3].map((id) => ({
			key: workspaceResourceKey({ type: 'notes', id: [testNoteId(id)] }),
			entry: {
				kind: 'present' as const,
				snapshot: {
					etag: syncEtag(1n),
					value: {
						type: 'notes' as const,
						value: noteBuilder({
							id: testNoteId(id),
							title: `Note ${id}`,
							plainText: 'ship release',
							document: {
								type: 'doc',
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ship release' }] }]
							}
						})
					}
				}
			}
		})),
		remove: []
	});
	await resources.initialize();
	outbox.appendFailures.set(
		workspaceResourceKey({ type: 'notes', id: [testNoteId(2)] }),
		'Device storage is full'
	);
	return {
		resources,
		outbox,
		account,
		stop: () => {
			stopObserving();
			resources.stop();
		}
	};
}
