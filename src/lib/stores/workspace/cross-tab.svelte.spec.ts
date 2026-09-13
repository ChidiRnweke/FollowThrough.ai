import { WorkspaceChangeChannel } from '$lib/client/sync/change-channel';
import { IndexedDbStorageRecovery } from '$lib/client/sync/storage-recovery';
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
	const cache = new IndexedDbSyncCache(workspaceRecordSchema);
	const identity = { type: 'projects', id: [project.id] } satisfies WorkspaceResourceIdentity;
	await cache.commit(accountId, {
		put: [
			{
				key: workspaceResourceKey(identity),
				entry: {
					kind: 'present',
					cache: {
						kind: 'cached',
						snapshot: { etag: syncEtag(1n), value: { type: 'projects', value: project } }
					}
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
		await draft.stage({
			command: { kind: 'renameProject', projectId: project.id, name: 'From another tab' },
			local: { type: 'projects', value: { ...project, name: 'From another tab' } },
			coalesce: 'name',
			references: []
		});
		await expect
			.poll(() => second.views.get('projects', project.id)?.name)
			.toBe('From another tab');
	} finally {
		first.stop();
		second.stop();
		await cache.close();
	}
});

it('observes recovery data committed by another client', async () => {
	const accountId = crypto.randomUUID();
	const first = createWorkspaceResources(accountId);
	const second = createWorkspaceResources(accountId);
	first.setOnline(false);
	second.setOnline(false);
	const channel = new WorkspaceChangeChannel(accountId);
	try {
		await Promise.all([first.initialize(), second.initialize()]);
		await new IndexedDbStorageRecovery().save(
			{
				accountId,
				source: 'legacy-note',
				key: `${accountId}:damaged`,
				message: 'Unreadable',
				impact: { kind: 'write', operationId: null }
			},
			'Preserved'
		);
		channel.publish('writes');
		await expect
			.poll(() => second.recoveryItems.map((item) => item.message))
			.toEqual(['Unreadable']);
	} finally {
		channel.close();
		first.stop();
		second.stop();
	}
});
