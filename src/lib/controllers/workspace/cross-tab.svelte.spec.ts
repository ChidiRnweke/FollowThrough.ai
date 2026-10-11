import { afterEach, expect, it } from 'vitest';
import { IndexedDbWorkspaceReplica } from '$lib/client/repositories/workspace/replica';
import { workspaceCommandSchema } from '$lib/models/workspace-mutations';
import { resourceDataSchemas, workspaceRecordSchema } from '$lib/models/workspace-records';
import { type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { syncEtag } from '$lib/models/sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { WorkspaceController } from './workspace';
import { projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryWorkspaceTransport } from '$lib/testing/workspace/fakes/in-memory-transport';
import { workspaceTab } from '$lib/testing/workspace/fixtures/workspace';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});

/** Two tabs of one browser: each opens its own IndexedDB connection to the account. */
const tabs = (accountId: string) => {
	const transport = new InMemoryWorkspaceTransport();
	const locks = new Map<string, Promise<void>>();
	const replica = () =>
		new IndexedDbWorkspaceReplica(workspaceCommandSchema, workspaceRecordSchema);
	const first = workspaceTab(accountId, replica(), transport, locks);
	const second = workspaceTab(accountId, replica(), transport, locks);
	started.push(first.workspace, second.workspace);
	return { first, second };
};

// SYNC-TABS: separate clients use real IndexedDB connections and their change notifications.
it('observes an offline edit from another client without a refresh', async () => {
	const accountId = resourceDataSchemas.users.shape.id.parse(crypto.randomUUID());
	const project = projectBuilder({ userId: accountId });
	const identity = { type: 'projects', id: [project.id] } satisfies WorkspaceResourceIdentity;
	const { first, second } = tabs(accountId);
	const writer = await first.start(false);
	await first.storage.commitCache(accountId, {
		put: [
			{
				key: workspaceResourceKey(identity),
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(1n), value: { type: 'projects', value: project } }
				}
			}
		]
	});
	await second.start(false);
	const draft = writer.draft(identity);
	await draft.read();
	await draft.stage({ kind: 'renameProject', projectId: project.id, name: 'From another tab' });
	await expect.poll(() => second.views.get('projects', project.id)?.name).toBe('From another tab');
});

it('stops both open clients when this account is reset', async () => {
	const accountId = crypto.randomUUID();
	const { first, second } = tabs(accountId);
	const [one, two] = [await first.start(false), await second.start(false)];
	await first.workspace.resetLocalWorkspace();
	await expect
		.poll(() => ({ first: one.active, second: two.active }))
		.toEqual({
			first: false,
			second: false
		});
});
