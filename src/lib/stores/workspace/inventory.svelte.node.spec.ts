import { afterEach, expect, it } from 'vitest';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { syncEtag } from '$lib/models/sync';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceResources } from './resources.svelte';

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const stop of cleanup.splice(0)) stop();
});

// SYNC-READINESS and SYNC-CONTINUITY: a partial inventory cannot discard an observed parent or draft.
it('retains the observed note when offline restoration needs unavailable parent facts', async () => {
	const accountId = testActor().userId;
	const note = noteBuilder({ parentId: testNoteId(2), archivedAt: testNow });
	const record: WorkspaceRecord = { type: 'notes', value: note };
	const identity = { type: 'notes', id: [note.id] } satisfies WorkspaceResourceIdentity;
	const repository = new InMemorySyncCache<WorkspaceRecord>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(repository);
	const cache = new ResourceCache(accountId, {
		repository: outbox.projectedCache,
		transport: new InMemorySyncTransport<WorkspaceRecord>()
	});
	const writes = new MutationQueue<WorkspaceCommand, WorkspaceRecord>(accountId, {
		repository: outbox,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		transport: {
			send: async () => {
				throw new Error('This scenario stays offline');
			}
		},
		pull: () => cache.refresh()
	});
	const resources = new WorkspaceResources(accountId, { repository: outbox, cache, writes });
	cleanup.push(() => resources.stop());
	cleanup.push(outbox.observe(accountId, (state) => resources.applyLocal(state)));
	await repository.commit(accountId, {
		put: [
			{
				key: workspaceResourceKey(identity),
				entry: { kind: 'present', snapshot: { etag: syncEtag(1n), value: record } }
			}
		],
		remove: [],
		inventoryComplete: false
	});
	resources.setOnline(false);
	const draft = resources.draft(identity);
	await draft.read();
	const result = await draft.stage({ kind: 'restoreNote', noteId: note.id });
	expect({ result, retained: draft.value, pending: resources.pending.length }).toEqual({
		result: {
			kind: 'failure',
			message: 'Required workspace data is not available on this device. Reconnect and retry.'
		},
		retained: note,
		pending: 0
	});
});
