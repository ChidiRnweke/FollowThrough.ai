import { afterEach, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TrashInventory from './trash-inventory.svelte';
import type { WorkspaceController } from '$lib/controllers/workspace/workspace';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';

const { workspaceRecordIdentity, workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});
/** An offline device whose inventory download has not finished; `knownTrash` adds a trashed note. */
const setup = async (knownTrash = false) => {
	const fixture = workspaceFixture({ accountId: testActor().userId });
	started.push(fixture.workspace);
	const records: WorkspaceRecord[] = [
		{ type: 'projects', value: projectBuilder({ role: 'inbox' }) },
		{
			type: 'users',
			value: {
				id: testActor().userId,
				email: 'reader@example.test',
				displayName: 'Reader',
				role: 'USER',
				createdAt: testNow,
				updatedAt: testNow
			}
		},
		...(knownTrash
			? [
					{
						type: 'notes' as const,
						value: noteBuilder({ title: 'Known trashed note', archivedAt: testNow })
					}
				]
			: [])
	];
	fixture.replica.seed(
		testActor().userId,
		records.map((value) => ({
			key: workspaceResourceKey(workspaceRecordIdentity(value)),
			entry: { kind: 'present' as const, snapshot: { etag: syncEtag(1n), value } }
		}))
	);
	const resources = await fixture.start(false);
	const graph = { workspace: fixture.workspace, views: fixture.views };
	return { resources, graph };
};
it('shows empty only after the incomplete inventory completes', async () => {
	const { resources, graph } = await setup();
	const screen = await render(TrashInventory, { graph });
	await expect
		.element(screen.getByText('The trash is empty', { exact: true }))
		.not.toBeInTheDocument();
	resources.setOnline(true);
	await resources.requireCollections();
	await expect.element(screen.getByText('The trash is empty', { exact: true })).toBeVisible();
});
it('keeps downloaded rows visible and protects incomplete inventory from emptying', async () => {
	const { graph } = await setup(true);
	const screen = await render(TrashInventory, { graph });
	await expect.element(screen.getByText('Known trashed note', { exact: true })).toBeVisible();
	await expect
		.element(screen.getByRole('button', { name: 'Empty trash', exact: true }))
		.not.toBeInTheDocument();
});
