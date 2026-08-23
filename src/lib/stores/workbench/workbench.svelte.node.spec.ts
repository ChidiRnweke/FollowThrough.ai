import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import type { WorkspaceRecord } from '$lib/client/notes/sync/indexeddb-workspace-repository';
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
	store.focusedTabId = focused;
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

// The strip stays on screen off `/notes/*`, and its focus is still the last workbench
// session's — so the tab the user *arrived from* is the one whose focus state already
// matches. Treating that as a no-op made it the single dead tab in the strip: every
// other tab navigated, that one did nothing.
describe('Workbench store clicking a tab away from the workbench', () => {
	const settingsSetup = (openTabs: readonly NoteId[], focused: NoteId) =>
		setup('/settings', openTabs, focused);

	it('navigates back to the tab the user arrived from', async () => {
		const { router, store } = settingsSetup(twoTabs, NOTE_A);
		await store.focusTab(NOTE_A);
		expect(router.currentUrl().pathname).toBe(`/notes/${NOTE_A}`);
	});

	it('carries the rest of the strip back into the URL', async () => {
		const { router, store } = settingsSetup(twoTabs, NOTE_A);
		await store.focusTab(NOTE_A);
		expect(router.currentUrl().searchParams.get('tabs')).toBe(`${NOTE_A},${NOTE_B}`);
	});

	it('still navigates when a different tab is clicked', async () => {
		const { router, store } = settingsSetup(twoTabs, NOTE_A);
		await store.focusTab(NOTE_B);
		expect(router.currentUrl().pathname).toBe(`/notes/${NOTE_B}`);
	});

	// On a workbench route the guard is right: clicking the tab you are already on
	// must not push a history entry.
	it('stays put when the focused tab is clicked on its own route', async () => {
		const { router, store } = setup(twoTabUrl, twoTabs, NOTE_A);
		await store.focusTab(NOTE_A);
		expect(router.gotoCount).toBe(0);
	});
});

// Closing is the mirror image: navigating to whatever survives would drag the user
// into the workbench they had just left.
describe('Workbench store closing a tab away from the workbench', () => {
	const settingsSetup = (openTabs: readonly NoteId[], focused: NoteId) =>
		setup('/settings', openTabs, focused);

	it('drops the closed tab from the strip', async () => {
		const { store } = settingsSetup(twoTabs, NOTE_A);
		await store.closeTab(NOTE_A);
		expect(store.openTabs).toEqual([NOTE_B]);
	});

	it('stays on the current route', async () => {
		const { router, store } = settingsSetup(twoTabs, NOTE_A);
		await store.closeTab(NOTE_A);
		expect(router.gotoCount).toBe(0);
	});

	it('refocuses a surviving tab', async () => {
		const { store } = settingsSetup(twoTabs, NOTE_A);
		await store.closeTab(NOTE_A);
		expect(store.focusedNoteId).toBe(NOTE_B);
	});

	it('persists the closed tab', async () => {
		const { repository, store } = settingsSetup(twoTabs, NOTE_A);
		await store.closeTab(NOTE_A);
		expect(repository.record?.openTabs).toEqual([NOTE_B]);
	});

	it('unpins a tab closed in bulk', async () => {
		const { store } = settingsSetup(twoTabs, NOTE_A);
		store.pinnedTabs = [NOTE_A, NOTE_B];
		await store.closeTabs([NOTE_A]);
		expect(store.pinnedTabs).toEqual([NOTE_B]);
	});

	// Emptying the strip has no URL to move to either, so it must not reach for `/today`.
	it('empties the strip in place when every tab is closed', async () => {
		const { store } = settingsSetup(twoTabs, NOTE_A);
		await store.closeTabs(twoTabs);
		expect(store.openTabs).toEqual([]);
	});

	it('does not leave for the overview when every tab is closed', async () => {
		const { router, store } = settingsSetup(twoTabs, NOTE_A);
		await store.closeTabs(twoTabs);
		expect(router.currentUrl().pathname).toBe('/settings');
	});
});

describe('Workbench store opening a pair of tabs', () => {
	const CHAT = 'chat:33333333-3333-4333-8333-333333333333';
	const DRAFT = 'draft:33333333-3333-4333-8333-333333333333';

	/** The gallery's starting point: a page with no workbench tabs open at all. */
	const emptyWorkbench = () => {
		const context = setup('/diagrams', [NOTE_A], NOTE_A);
		context.store.openTabs = [];
		context.store.focusedTabId = undefined;
		return context;
	};

	// The studio is a pair, so it has to arrive as one navigation: two `goto`s
	// leave a history entry showing a chat with no canvas beside it.
	it('navigates once for both tabs', async () => {
		const { router, store } = emptyWorkbench();
		await store.openSplit(CHAT, DRAFT);
		expect(router.gotoCount).toBe(1);
	});

	it('focuses the first tab', async () => {
		const { router, store } = emptyWorkbench();
		await store.openSplit(CHAT, DRAFT);
		expect(router.currentUrl().searchParams.get('focus')).toBe(CHAT);
	});

	it('puts the second tab in the split', async () => {
		const { router, store } = emptyWorkbench();
		await store.openSplit(CHAT, DRAFT);
		expect(router.currentUrl().searchParams.get('split')).toBe(DRAFT);
	});

	it('opens both tabs in the strip', async () => {
		const { router, store } = emptyWorkbench();
		await store.openSplit(CHAT, DRAFT);
		expect(router.currentUrl().searchParams.get('tabs')).toBe(`${CHAT},${DRAFT}`);
	});
});
