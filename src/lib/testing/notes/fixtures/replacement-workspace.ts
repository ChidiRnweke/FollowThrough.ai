import { rebaseWorkspaceRecord } from '$lib/controllers/workspace/rebase';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { createResourceCache } from '$lib/factories/sync/cache';
import { createMutationQueue } from '$lib/factories/sync/submission';
import { assembleWorkspaceResources } from '$lib/factories/workspace/resources';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import {
	noteBuilder,
	projectBuilder,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

export async function replacementWorkspace() {
	const account = 'replacement-fixture';
	const repository = new InMemorySyncCache<WorkspaceRecord>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(
		rebaseWorkspaceRecord,
		repository
	);
	const cache = createResourceCache(account, {
		repository: outbox.projectedCache,
		transport: new InMemorySyncTransport<WorkspaceRecord>()
	});
	const { writes, execution } = createMutationQueue<WorkspaceCommand, WorkspaceRecord>(account, {
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
	const resources = assembleWorkspaceResources(account, {
		repository: outbox,
		cache,
		writes,
		execution
	});
	resources.setOnline(false);
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
			resources.stop();
		}
	};
}
