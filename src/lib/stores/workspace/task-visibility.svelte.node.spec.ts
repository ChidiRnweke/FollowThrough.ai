import { afterEach, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { workspaceResourcesFixture } from '$lib/testing/sync/fixtures/workspace-resources';
import {
	projectBuilder,
	todoBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const stop of cleanup.splice(0)) stop();
});
const setup = async (includeProject = true) => {
	const context = workspaceResourcesFixture(testActor().userId);
	cleanup.push(() => context.resources.stop());
	const project = projectBuilder();
	const todo = todoBuilder();
	if (includeProject)
		await context.cache.accept(workspaceResourceKey({ type: 'projects', id: [project.id] }), {
			etag: syncEtag(1n),
			value: { type: 'projects', value: project }
		});
	await context.cache.accept(workspaceResourceKey({ type: 'todos', id: [todo.id] }), {
		etag: syncEtag(2n),
		value: { type: 'todos', value: todo }
	});
	await context.resources.initialize();
	context.resources.setOnline(false);
	return { ...context, project, todo };
};

it('removes a task detail after its project is archived offline', async () => {
	const { resources, project, todo } = await setup();
	const draft = resources.draft({ type: 'projects', id: [project.id] });
	await draft.read();
	const result = await draft.stage({ kind: 'archiveProject', projectId: project.id });
	if (result.kind === 'failure') throw new Error(result.message);
	expect(resources.views.todo(todo)).toBeNull();
});

it('keeps the downloaded task detail available in an active project', async () => {
	const { resources, todo } = await setup();
	expect(resources.views.todo(todo)?.todo).toEqual(todo);
});

it('does not expose a task detail before its project context is downloaded', async () => {
	const { resources, todo } = await setup(false);
	expect(resources.views.todo(todo)).toBeNull();
});

it('does not expose a deleted task detail retained in the sync inventory', async () => {
	const { resources, cache, todo } = await setup();
	const deleted = { ...todo, deletedAt: testNow };
	await cache.accept(workspaceResourceKey({ type: 'todos', id: [todo.id] }), {
		etag: syncEtag(3n),
		value: { type: 'todos', value: deleted }
	});
	expect(resources.views.todo(deleted)).toBeNull();
});
