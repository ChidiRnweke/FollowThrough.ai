import { describe, expect, it } from 'vitest';
import { createWorkbenchContext } from '$lib/testing/workbench/context';
import { InMemoryWorkbenchLayout } from '$lib/testing/workbench/fakes/in-memory-layout';
import { InMemoryWorkbenchRouter } from '$lib/testing/workbench/fakes/in-memory-router';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const setup = () => {
	const router = new InMemoryWorkbenchRouter(`/notes/${first}`);
	const repository = new InMemoryWorkbenchLayout();
	return { router, repository, ...createWorkbenchContext(router, repository) };
};
describe('workbench navigation history', () => {
	it('reordering replaces history instead of adding a focus stop', async () => {
		const { router, layout, navigation, view } = setup();
		await layout.hydrate();
		await navigation.openTab(second);
		await navigation.moveTab(first, second);
		router.back();
		layout.syncFromUrl();
		expect({ focus: view.focusedTabId, tabs: view.openTabs }).toEqual({
			focus: first,
			tabs: [first]
		});
	});
	it('forward restores the reordered tabs and their focus', async () => {
		const { router, layout, navigation, view } = setup();
		await layout.hydrate();
		await navigation.openTab(second);
		await navigation.moveTab(first, second);
		router.back();
		layout.syncFromUrl();
		router.forward();
		layout.syncFromUrl();
		expect({ focus: view.focusedTabId, tabs: view.openTabs }).toEqual({
			focus: second,
			tabs: [second, first]
		});
	});
	it('closing the secondary pane keeps its tab and back restores the split', async () => {
		const { router, layout, navigation, view } = setup();
		await layout.hydrate();
		await navigation.openSplit(first, second);
		await navigation.setSplit(undefined);
		router.back();
		layout.syncFromUrl();
		expect({ focus: view.focusedTabId, tabs: view.openTabs, split: view.splitTabId }).toEqual({
			focus: first,
			tabs: [first, second],
			split: second
		});
	});
});
