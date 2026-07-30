import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models';
import type { WorkspaceRecord } from '$lib/client/note-sync/indexeddb-workspace-repository';
import { WorkbenchStore, type WorkbenchRouter, type WorkspaceRepository } from './workbench.svelte';

const NOTE_A = '11111111-1111-4111-8111-111111111111' as NoteId;
const NOTE_B = '22222222-2222-4222-8222-222222222222' as NoteId;

/** Records what was written so persistence can be asserted without IndexedDB. */
class InMemoryWorkspaceRepository implements WorkspaceRepository {
	record?: WorkspaceRecord;

	async get(): Promise<WorkspaceRecord | undefined> {
		return this.record;
	}

	async put(record: WorkspaceRecord): Promise<void> {
		this.record = record;
	}
}

/**
 * Stands in for SvelteKit's router.  `goto` resolves a tick late — as the real
 * one does — and while it is in flight `page.url` is still the *old* URL.  The
 * `onNavigationPending` hook is how a test reproduces the layout's `$effect`
 * firing during that window.
 */
class FakeRouter implements WorkbenchRouter {
	url: URL;
	onNavigationPending?: () => void;
	gotoCount = 0;
	invalidateAllCount = 0;

	constructor(href: string) {
		this.url = new URL(href, 'https://followthrough.test');
	}

	async goto(url: string): Promise<void> {
		this.gotoCount += 1;
		this.onNavigationPending?.();
		await Promise.resolve();
		this.url = new URL(url, 'https://followthrough.test');
	}

	async invalidateAll(): Promise<void> {
		this.invalidateAllCount += 1;
	}

	currentUrl(): URL {
		return this.url;
	}
}

const setup = (href: string, openTabs: readonly NoteId[], focused: NoteId) => {
	const router = new FakeRouter(href);
	const repository = new InMemoryWorkspaceRepository();
	const store = new WorkbenchStore(router, repository);
	store.openTabs = openTabs;
	store.focusedNoteId = focused;
	return { router, repository, store };
};

const twoTabs = [NOTE_A, NOTE_B];
const twoTabUrl = `/notes/${NOTE_A}?tabs=${NOTE_A},${NOTE_B}`;
const singleTabUrl = `/notes/${NOTE_A}?tabs=${NOTE_A}`;

describe('Workbench store closing every tab', () => {
	// An empty strip has no URL representation, so closing the last tabs has to
	// navigate to `/today`.  Clearing `focusedNoteId` invalidates the layout's
	// `$effect`, which re-runs *before* that navigation settles — at which point
	// `page.url` is still the note URL.  Without the guard held across `goto`,
	// `syncFromUrl` parsed that stale URL and put every tab straight back, so
	// closing all tabs took two clicks.
	it('leaves the strip empty when the layout syncs mid-navigation', async () => {
		const { router, store } = setup(twoTabUrl, twoTabs, NOTE_A);
		router.onNavigationPending = () => store.syncFromUrl();
		await store.closeTabs(twoTabs);
		expect(store.openTabs).toEqual([]);
	});

	it('clears the focused note when the layout syncs mid-navigation', async () => {
		const { router, store } = setup(twoTabUrl, twoTabs, NOTE_A);
		router.onNavigationPending = () => store.syncFromUrl();
		await store.closeTabs(twoTabs);
		expect(store.focusedNoteId).toBeUndefined();
	});

	it('navigates to the overview once', async () => {
		const { router, store } = setup(twoTabUrl, twoTabs, NOTE_A);
		await store.closeTabs(twoTabs);
		expect(router.currentUrl().pathname).toBe('/today');
	});

	it('persists the empty strip rather than the stale tab set', async () => {
		const { router, repository, store } = setup(twoTabUrl, twoTabs, NOTE_A);
		router.onNavigationPending = () => store.syncFromUrl();
		await store.closeTabs(twoTabs);
		expect(repository.record?.openTabs).toEqual([]);
	});

	// A closed tab must not stay pinned, or it reappears on the next hydrate.
	it('unpins tabs that were closed', async () => {
		const { store } = setup(twoTabUrl, twoTabs, NOTE_A);
		store.pinnedTabs = [NOTE_A];
		await store.closeTabs(twoTabs);
		expect(store.pinnedTabs).toEqual([]);
	});

	// Same last-tab branch, reached one tab at a time.
	it('leaves the strip empty when the final tab is closed individually', async () => {
		const { router, store } = setup(singleTabUrl, [NOTE_A], NOTE_A);
		router.onNavigationPending = () => store.syncFromUrl();
		await store.closeTab(NOTE_A);
		expect(store.openTabs).toEqual([]);
	});

	// Same branch again, reached by archiving the only open note.
	it('leaves the strip empty when every open note is pruned', async () => {
		const { router, store } = setup(twoTabUrl, twoTabs, NOTE_A);
		router.onNavigationPending = () => store.syncFromUrl();
		await store.pruneClosedNotes(new Set());
		expect(store.openTabs).toEqual([]);
	});

	// The guard is only meant to cover the teardown; releasing it must not
	// leave the store deaf to genuine later navigations.
	it('tracks the URL again after the strip has been cleared', async () => {
		const { router, store } = setup(twoTabUrl, twoTabs, NOTE_A);
		await store.closeTabs(twoTabs);
		router.url = new URL(twoTabUrl, 'https://followthrough.test');
		store.syncFromUrl();
		expect(store.openTabs).toEqual(twoTabs);
	});
});

// Off `/notes/*` the tab strip isn't rendered and `syncFromUrl` stops applying the
// URL, so the in-memory tabs are the last workbench session's.  Archiving from the
// sidebar there used to prune *by navigating* — which dragged the user into the
// workbench and, because the layout re-runs the prune after every navigation, fed
// itself a `goto` + `invalidateAll` per pass until the effect graph gave up.
describe('Workbench store pruning away from the workbench', () => {
	const todaySetup = (openTabs: readonly NoteId[], focused: NoteId) =>
		setup('/today', openTabs, focused);

	it('drops the archived tab from the strip', async () => {
		const { store } = todaySetup(twoTabs, NOTE_A);
		await store.pruneClosedNotes(new Set([NOTE_B]));
		expect(store.openTabs).toEqual([NOTE_B]);
	});

	it('refocuses a surviving tab when the focused note is archived', async () => {
		const { store } = todaySetup(twoTabs, NOTE_A);
		await store.pruneClosedNotes(new Set([NOTE_B]));
		expect(store.focusedNoteId).toBe(NOTE_B);
	});

	it('unpins an archived tab', async () => {
		const { store } = todaySetup(twoTabs, NOTE_A);
		store.pinnedTabs = [NOTE_A, NOTE_B];
		await store.pruneClosedNotes(new Set([NOTE_B]));
		expect(store.pinnedTabs).toEqual([NOTE_B]);
	});

	it('stays on the current route', async () => {
		const { router, store } = todaySetup(twoTabs, NOTE_A);
		await store.pruneClosedNotes(new Set([NOTE_B]));
		expect(router.gotoCount).toBe(0);
	});

	it('does not reload the page data', async () => {
		const { router, store } = todaySetup(twoTabs, NOTE_A);
		await store.pruneClosedNotes(new Set([NOTE_B]));
		expect(router.invalidateAllCount).toBe(0);
	});

	it('persists the pruned strip', async () => {
		const { repository, store } = todaySetup(twoTabs, NOTE_A);
		await store.pruneClosedNotes(new Set([NOTE_B]));
		expect(repository.record?.openTabs).toEqual([NOTE_B]);
	});

	it('empties the strip when every open note is archived', async () => {
		const { store } = todaySetup(twoTabs, NOTE_A);
		await store.pruneClosedNotes(new Set());
		expect(store.openTabs).toEqual([]);
	});

	// The layout fires the prune as a fire-and-forget call from its `$effect`, so a
	// navigation started by one prune re-enters before the first has settled.
	it('ignores a prune that re-enters while one is in flight', async () => {
		const { router, store } = setup(twoTabUrl, twoTabs, NOTE_A);
		router.onNavigationPending = () => void store.pruneClosedNotes(new Set([NOTE_B]));
		await store.pruneClosedNotes(new Set([NOTE_B]));
		expect(router.gotoCount).toBe(1);
	});
});
