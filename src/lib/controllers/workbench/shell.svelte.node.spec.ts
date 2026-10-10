import { describe, expect, it } from 'vitest';
import { WorkbenchShell } from './shell';
import { BrowserWorkbenchTabReader } from '$lib/client/workbench/tab-ref';
import { createWorkbenchContext } from '$lib/testing/workbench/context';
import { InMemoryWorkbenchLayout } from '$lib/testing/workbench/fakes/in-memory-layout';
import { InMemoryWorkbenchRouter } from '$lib/testing/workbench/fakes/in-memory-router';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { WorkspaceViewsController } from '$lib/controllers/workspace/views';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

const note = noteBuilder();
const setup = () => {
	const router = new InMemoryWorkbenchRouter(`/notes/${note.id}`);
	const repository = new InMemoryWorkbenchLayout();
	const context = createWorkbenchContext(router, repository);
	const shell = new WorkbenchShell(
		context.layout,
		context.navigation,
		new BrowserWorkbenchTabReader()
	);
	const views = capabilityDependencies<WorkspaceViewsController>({});
	return { ...context, router, repository, shell, views };
};
describe('workbench shell reconciliation', () => {
	it('saves the initial layout without requiring a downloaded workspace catalog', async () => {
		const { shell, storage, conversations } = setup();
		const repository = new InMemoryWorkbenchLayout();
		storage.accounts.set('new-account', repository);
		shell.start('new-account', conversations);
		await expect.poll(() => repository.record?.openTabs).toEqual([note.id]);
	});
	it('retains a tab missing from an incomplete workspace inventory', async () => {
		const { shell, views, view } = setup();
		await shell.reconcile({
			shell: { noteTree: [] },
			resources: { availability: 'unknown', views }
		});
		expect(view.openTabs).toEqual([note.id]);
	});
	it('closes a deleted note only when the workspace inventory is complete', async () => {
		const { shell, views, router, view } = setup();
		await shell.reconcile({
			shell: { noteTree: [] },
			resources: { availability: 'complete', views }
		});
		expect({ tabs: view.openTabs, path: router.url.pathname }).toEqual({
			tabs: [],
			path: '/today'
		});
	});
	it('resolves the focused project through the current workspace catalog', async () => {
		const { shell, views, view } = setup();
		await shell.reconcile({
			shell: { noteTree: [note] },
			resources: { availability: 'complete', views }
		});
		expect(view.activeProjectId).toBe(note.projectId);
	});
});
