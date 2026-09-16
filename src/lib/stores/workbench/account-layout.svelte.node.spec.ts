import { describe, expect, it } from 'vitest';
import type { WorkbenchLayoutRecord } from '$lib/models/workbench';
import { InMemoryWorkbenchLayout } from '$lib/testing/workbench/fakes/in-memory-layout';
import { InMemoryWorkbenchRouter } from '$lib/testing/workbench/fakes/in-memory-router';
import { WorkbenchStore } from './workbench.svelte';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';
const record = (tabs: string[]): WorkbenchLayoutRecord => ({
	id: 'current',
	openTabs: tabs,
	focusedNoteId: tabs[0],
	pinnedTabs: tabs,
	recentlyUsed: tabs,
	stripHidden: false,
	splitRatio: 0.5
});
const setup = (url = `/notes/${first}`) => {
	const router = new InMemoryWorkbenchRouter(url);
	const repository = new InMemoryWorkbenchLayout();
	repository.record = record([first, second]);
	const store = new WorkbenchStore(router, repository);
	return { router, repository, store };
};

describe('account-bound workbench restoration', () => {
	it('does not save an old navigation into the next account layout', async () => {
		const { store, repository, router } = setup();
		await store.hydrate(() => undefined);
		const gate = Promise.withResolvers<void>();
		router.navigationGate = gate.promise;
		const opening = store.openTab(second);
		const next = new InMemoryWorkbenchLayout();
		next.record = record([third]);
		store.attach(next);
		router.navigationGate = undefined;
		await router.goto(`/notes/${third}`);
		await store.hydrate(() => undefined);
		gate.resolve();
		await opening;
		expect({
			url: router.url.pathname,
			current: next.record?.openTabs,
			previous: repository.record?.openTabs
		}).toEqual({ url: `/notes/${third}`, current: [third], previous: [first, second] });
	});
	it('restores sibling tabs while preserving the deep link focus', async () => {
		const { store } = setup(`/notes/${second}`);
		await store.hydrate(() => undefined);
		expect({ tabs: store.openTabs, focus: store.focusedTabId }).toEqual({
			tabs: [first, second],
			focus: second
		});
	});
	it('clears resource and interaction state when an account detaches', async () => {
		const { store, repository } = setup();
		const detach = store.attach(repository);
		await store.hydrate(() => undefined);
		detach();
		expect({
			tabs: store.openTabs,
			pins: store.pinnedTabs,
			recent: store.recentlyUsed,
			focus: store.focusedTabId,
			interaction: store.interactionFocusedTabId
		}).toEqual({ tabs: [], pins: [], recent: [], focus: undefined, interaction: undefined });
	});
	it('does not apply a delayed layout from the previous account', async () => {
		const { store, repository, router } = setup();
		const gate = Promise.withResolvers<void>();
		repository.readGate = gate.promise;
		const oldHydration = store.hydrate(() => undefined);
		const next = new InMemoryWorkbenchLayout();
		next.record = record([third]);
		store.attach(next);
		router.url = new URL(`/notes/${third}`, 'https://followthrough.test');
		await store.hydrate(() => undefined);
		gate.resolve();
		await oldHydration;
		expect({ tabs: store.openTabs, pins: store.pinnedTabs, stored: next.record?.openTabs }).toEqual(
			{ tabs: [third], pins: [third], stored: [third] }
		);
	});
	it('keeps a newer navigation when the saved layout read finishes later', async () => {
		const { store, repository, router } = setup();
		const gate = Promise.withResolvers<void>();
		repository.readGate = gate.promise;
		const hydration = store.hydrate(() => undefined);
		router.url = new URL(`/notes/${third}`, 'https://followthrough.test');
		store.syncFromUrl();
		gate.resolve();
		await hydration;
		expect({
			tabs: store.openTabs,
			url: router.url.pathname,
			stored: repository.record?.openTabs
		}).toEqual({ tabs: [third], url: `/notes/${third}`, stored: [third] });
	});
	it('does not replace stored sibling tabs while their initial read is pending', async () => {
		const { store, repository } = setup();
		const gate = Promise.withResolvers<void>();
		repository.readGate = gate.promise;
		const hydration = store.hydrate(() => undefined);
		store.syncFromUrl();
		gate.resolve();
		await hydration;
		expect(repository.record?.openTabs).toEqual([first, second]);
	});
	it('ignores cleanup from an older account binding', async () => {
		const { store, repository, router } = setup();
		const oldDetach = store.attach(repository);
		const next = new InMemoryWorkbenchLayout();
		next.record = record([third]);
		store.attach(next);
		router.url = new URL(`/notes/${third}`, 'https://followthrough.test');
		await store.hydrate(() => undefined);
		oldDetach();
		expect(store.openTabs).toEqual([third]);
	});
	it('does not navigate to the old overview after an account changes during a save', async () => {
		const { store, repository, router } = setup();
		await store.hydrate(() => undefined);
		const gate = Promise.withResolvers<void>();
		repository.writeGate = gate.promise;
		const closing = store.closeTabs([first, second]);
		const next = new InMemoryWorkbenchLayout();
		next.record = record([third]);
		store.attach(next);
		router.url = new URL(`/notes/${third}`, 'https://followthrough.test');
		await store.hydrate(() => undefined);
		gate.resolve();
		await closing;
		expect({ url: router.url.pathname, tabs: next.record?.openTabs }).toEqual({
			url: `/notes/${third}`,
			tabs: [third]
		});
	});
});
