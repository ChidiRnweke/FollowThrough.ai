import { afterEach, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { WorkspaceController } from './workspace';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';
import {
	projectBuilder,
	todoBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const { workspaceRecordIdentity, workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});
const setup = async (includeProject = true) => {
	const fixture = workspaceFixture({ accountId: testActor().userId });
	started.push(fixture.workspace);
	const project = projectBuilder();
	const todo = todoBuilder();
	/** A version the background download stored on this device. */
	const accept = async (value: WorkspaceRecord, version: bigint) => {
		fixture.replica.seed(fixture.accountId, [
			{
				key: workspaceResourceKey(workspaceRecordIdentity(value)),
				entry: { kind: 'present', snapshot: { etag: syncEtag(version), value } }
			}
		]);
		await fixture.replica.read(fixture.accountId);
	};
	if (includeProject) await accept({ type: 'projects', value: project }, 1n);
	await accept({ type: 'todos', value: todo }, 2n);
	const resources = await fixture.start(false);
	return { ...fixture, resources, accept, project, todo };
};

it('removes a task detail after its project is archived offline', async () => {
	const { resources, views, project, todo } = await setup();
	const draft = resources.draft({ type: 'projects', id: [project.id] });
	await draft.read();
	const result = await draft.stage({ kind: 'archiveProject', projectId: project.id });
	if (result.kind === 'failure') throw new Error(result.message);
	expect(views.todo(todo)).toBeNull();
});

it('keeps the downloaded task detail available in an active project', async () => {
	const { views, todo } = await setup();
	expect(views.todo(todo)?.todo).toEqual(todo);
});

it('does not expose a task detail before its project context is downloaded', async () => {
	const { views, todo } = await setup(false);
	expect(views.todo(todo)).toBeNull();
});

it('does not expose a deleted task detail retained in the sync inventory', async () => {
	const { views, accept, todo } = await setup();
	const deleted = { ...todo, deletedAt: testNow };
	await accept({ type: 'todos', value: deleted }, 3n);
	expect(views.todo(deleted)).toBeNull();
});
