import { IndexedDbStorageRecovery } from '$lib/client/sync/storage-recovery';
import { WorkspaceDatabase } from '$lib/client/sync/database';
import { expect, it } from 'vitest';
import { workspaceRecordSchema, resourceDataSchemas } from '$lib/models/workspace-records';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { createWorkspaceResources } from './resources.svelte';
import { IndexedDbSyncCache } from '$lib/client/sync/indexeddb-cache';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';

// SYNC-TABS: separate clients use real IndexedDB, Web Locks and BroadcastChannel.
it('observes an offline edit from another client without a refresh', async () => {
	const accountId = resourceDataSchemas.users.shape.id.parse(crypto.randomUUID());
	const project = projectBuilder({ userId: accountId });
	const cache = new IndexedDbSyncCache(workspaceRecordSchema, new WorkspaceDatabase(accountId));
	const identity = { type: 'projects', id: [project.id] } satisfies WorkspaceResourceIdentity;
	await cache.commit(accountId, {
		put: [
			{
				key: workspaceResourceKey(identity),
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(1n), value: { type: 'projects', value: project } }
				}
			}
		],
		remove: []
	});
	const first = createWorkspaceResources(accountId);
	const second = createWorkspaceResources(accountId);
	first.setOnline(false);
	second.setOnline(false);
	try {
		await Promise.all([first.initialize(), second.initialize()]);
		const draft = first.draft(identity);
		await draft.read();
		await draft.stage({ kind: 'renameProject', projectId: project.id, name: 'From another tab' });
		await expect
			.poll(() => second.views.get('projects', project.id)?.name)
			.toBe('From another tab');
	} finally {
		first.stop();
		second.stop();
		await cache.close();
	}
});

it('stops both open clients when this account is reset', async () => {
	const accountId = crypto.randomUUID();
	const first = createWorkspaceResources(accountId);
	const second = createWorkspaceResources(accountId);
	first.setOnline(false);
	second.setOnline(false);
	try {
		await Promise.all([first.initialize(), second.initialize()]);
		await new IndexedDbStorageRecovery().resetAccount(accountId);
		expect({ first: first.active, second: second.active }).toEqual({ first: false, second: false });
	} finally {
		first.stop();
		second.stop();
	}
});
