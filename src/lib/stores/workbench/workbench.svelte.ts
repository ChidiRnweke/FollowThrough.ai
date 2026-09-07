import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import {
	IndexedDbWorkbenchLayout,
	type WorkbenchLayoutRecord
} from '$lib/client/workbench/indexeddb-layout';
import {
	addTabInBackgroundInState,
	closeTabInState,
	closeTabsInState,
	focusTabInState,
	moveTabInState,
	openTabInState,
	parseWorkbenchUrl,
	serializeWorkbenchUrl,
	replaceTabInState,
	setSplitInState,
	type WorkbenchUrlState
} from './workbench-url';
import { noteIdOf, type TabId } from './tab-ref';
import { toast } from 'svelte-sonner';

/**
 * The store's window onto SvelteKit's router.  Injected rather than imported
 * directly so tests can drive the URL and the timing of a navigation — the
 * ordering between `goto` resolving and `syncFromUrl` re-running is load-bearing
 * (see `clearToOverview`) and can't be exercised against the real router.
 */
export type WorkbenchRouter = {
	goto: (url: string, options?: { replaceState?: boolean; noScroll?: boolean }) => Promise<void>;
	invalidateAll: () => Promise<void>;
	currentUrl: () => URL;
};

/** The slice of {@link IndexedDbWorkbenchLayout} this store depends on. */
export type WorkspaceRepository = {
	get: () => Promise<WorkbenchLayoutRecord | undefined>;
	put: (record: WorkbenchLayoutRecord) => Promise<void>;
};

const sveltekitRouter: WorkbenchRouter = {
	goto: (url, options) => goto(url, options),
	invalidateAll: () => invalidateAll(),
	currentUrl: () => page.url
};

/**
 * Reactive workbench shell state.
 *
 * The workbench shell renders inside `(app)/+layout.svelte` whenever the URL
 * matches `/notes/<id>`.  The URL is canonical: every user action (open,
 * close, focus, reorder) mutates the URL via `goto()`, so browser Back /
 * Forward walks the focused-tab history naturally.  An IndexedDB record
 * mirrors the URL on every change so the working set survives reloads and
 * device restarts; on a fresh session the layout reads that record to reopen
 * the last tab set.
 *
 * The store is a small reactive shell over the pure URL helpers in
 * `workbench-url.ts`.  URL ↔ state synchronisation follows the standard
 * SvelteKit feedback loop:
 *
 *   - a single `$effect` reads `page.url` into the in-memory state (and skips
 *     when the URL already matches, so there is no write cycle);
 *   - user-action methods (openTab / closeTab / focusTab / moveTab) write the
 *     URL via `goto()`; they do not mutate `openTabs` directly.  The read
 *     effect picks the change up on the next tick.
 */
export class WorkbenchStore {
	openTabs = $state<readonly TabId[]>([]);
	/**
	 * The focused tab. Named for history: it holds a {@link TabId}, which may be
	 * a chat. Note-only consumers should read {@link focusedNoteId}, which is
	 * `undefined` while a chat tab has focus.
	 */
	focusedTabId = $state<TabId | undefined>(undefined);
	/** Pane that most recently received real user interaction; distinct from URL-primary focus. */
	interactionFocusedTabId = $state<TabId | undefined>(undefined);
	pinnedTabs = $state<readonly TabId[]>([]);

	/** Recently-focused tabs, most-recent first.  Used to pick a tab to focus when the active one closes. */
	recentlyUsed = $state<readonly TabId[]>([]);

	/**
	 * The focused tab when it is a note, `undefined` when it is a chat.
	 *
	 * Every note-shaped consumer — the sidebar highlight, the editor-selection
	 * and suggestion-tray registries, the agent's app context — reads this, so a
	 * focused chat tab degrades to "no note in focus" rather than being handed a
	 * `chat:` id it would look up and miss.
	 */
	get focusedNoteId(): NoteId | undefined {
		return noteIdOf(this.focusedTabId);
	}

	/** The interaction-focused tab when it is a note. */
	get interactionFocusedNoteId(): NoteId | undefined {
		return noteIdOf(this.interactionFocusedTabId);
	}

	/** The split tab when it is a note, `undefined` when a chat is split. */
	get splitNoteId(): NoteId | undefined {
		return noteIdOf(this.splitTabId);
	}

	/**
	 * Whether the user has collapsed the global tab strip.  Display
	 * preference only — does not affect open-tab state.  Persists in
	 * localStorage (fast first-paint read) and in the IndexedDB
	 * `WorkbenchLayoutRecord` (cross-device source of truth).
	 */
	stripHidden = $state(false);

	/**
	 * The note currently shown in the secondary (split) pane, or
	 * `undefined` when there is no split.  URL-canonical via `?split=`, so
	 * this field mirrors `page.url` rather than being independently
	 * persisted.  Always distinct from `focusedNoteId` (invariant: a note
	 * can't be both primary and split).
	 */
	splitTabId = $state<TabId | undefined>(undefined);

	/**
	 * Width of the secondary pane as a fraction of 1 (clamped 0.25–0.75).
	 * Display preference — like `stripHidden`, persists to localStorage
	 * for instant first-paint and to the IndexedDB `WorkbenchLayoutRecord` for
	 * cross-device synchronisation.  The URL never encodes the ratio.
	 */
	splitRatio = $state(0.5);

	/**
	 * The conversation a chat session is showing, used to build its `/chats/<id>`
	 * pathname. Injected by the app layout rather than imported: the agent stores
	 * already depend on this one through the app context, and importing them back
	 * would close that loop at module-init time.
	 *
	 * Defaults to "no conversation yet", which serialises to `/chats/new` — the
	 * right answer for a chat that has not been sent.
	 */
	conversationOf: (sessionKey: string) => string | undefined = () => undefined;

	constructor(
		private readonly router: WorkbenchRouter = sveltekitRouter,
		private readonly repository: WorkspaceRepository = new IndexedDbWorkbenchLayout()
	) {}

	private hydrated = $state(false);
	/** Suppresses the URL→state effect while we're applying a user action this tick. */
	private applyingFromUrl = false;
	/** Suppresses persistence while we're restoring from IndexedDB on first load. */
	private restoring = false;
	/**
	 * Suppresses re-entrant pruning.  The layout fires `pruneClosedNotes` as a
	 * fire-and-forget call from its `$effect`, so without this a prune that
	 * navigates (and therefore re-runs the effect) starts a second prune before
	 * the first has settled — and if the navigation's load fails, every effect
	 * run retries it.  That's what turned one stale tab into a request storm.
	 */
	private pruning = false;

	private static readonly STRIP_HIDDEN_KEY = 'followthrough.workbench.stripHidden';
	private static readonly SPLIT_RATIO_KEY = 'followthrough.workbench.splitRatio';

	/**
	 * Reads the persisted `stripHidden` preference synchronously from
	 * localStorage so the first paint does not flash visible-then-hidden.
	 * Safe to call during `hydrate()` (browser-only); a no-op on the server.
	 */
	private readStripHiddenFromStorage(): void {
		if (typeof localStorage === 'undefined') return;
		const stored = localStorage.getItem(WorkbenchStore.STRIP_HIDDEN_KEY);
		if (stored === 'true') this.stripHidden = true;
		else if (stored === 'false') this.stripHidden = false;
	}

	/** Toggles the strip hidden state and persists to both localStorage and IndexedDB. */
	toggleStripHidden(): void {
		this.stripHidden = !this.stripHidden;
		if (typeof localStorage !== 'undefined')
			localStorage.setItem(WorkbenchStore.STRIP_HIDDEN_KEY, String(this.stripHidden));
		void this.persist();
	}

	/**
	 * Reads the persisted `splitRatio` synchronously from localStorage so
	 * the first paint of a split pane lands at the user's preferred width
	 * instead of the 50% default.  No-op on the server.
	 */
	private readSplitRatioFromStorage(): void {
		if (typeof localStorage === 'undefined') return;
		const stored = localStorage.getItem(WorkbenchStore.SPLIT_RATIO_KEY);
		if (stored === null) return;
		const parsed = Number.parseFloat(stored);
		if (Number.isFinite(parsed)) this.splitRatio = WorkbenchStore.clampSplitRatio(parsed);
	}

	/**
	 * Sets the split pane's width ratio.  Persists to localStorage (so
	 * the next session's first paint matches) and IndexedDB.  Does not
	 * touch the URL — the ratio is a display preference only.
	 */
	setSplitRatio(ratio: number): void {
		this.splitRatio = WorkbenchStore.clampSplitRatio(ratio);
		if (typeof localStorage !== 'undefined')
			localStorage.setItem(WorkbenchStore.SPLIT_RATIO_KEY, String(this.splitRatio));
		void this.persist();
	}

	private static clampSplitRatio(ratio: number): number {
		if (!Number.isFinite(ratio)) return 0.5;
		if (ratio < 0.25) return 0.25;
		if (ratio > 0.75) return 0.75;
		return ratio;
	}

	/**
	 * Returns `true` when the current URL is a workbench path (`/notes/<id>`).
	 * The layout uses this to decide whether to render the workbench shell or
	 * the standard `{@render children()}` outlet.
	 */
	get isWorkbenchPath(): boolean {
		const url = this.router.currentUrl();
		return parseWorkbenchUrl(url.pathname, url.searchParams) !== undefined;
	}

	/**
	 * Whether a second pane is actually on screen.  A `splitNoteId` alone is not
	 * enough: it must differ from the focused note and still be open as a tab.
	 * Lives here so the panes and the sidebar's space cue agree on one rule.
	 */
	get splitActive(): boolean {
		return (
			this.splitTabId !== undefined &&
			this.splitTabId !== this.focusedTabId &&
			this.openTabs.includes(this.splitTabId)
		);
	}

	/** A view of the focused pane's NoteId; mirrors `focusedNoteId` for ergonomic consumers. */
	get activeNoteId(): NoteId | undefined {
		return this.interactionFocusedNoteId ?? this.focusedNoteId;
	}

	setInteractionFocus(noteId: TabId): void {
		if (noteId === this.focusedTabId || noteId === this.splitTabId)
			this.interactionFocusedTabId = noteId;
	}

	/** The project id of the focused pane, resolved from the shell's tab tree on demand. */
	get activeProjectId(): ProjectId | undefined {
		return this._activeProjectId;
	}
	private _activeProjectId = $state<ProjectId | undefined>(undefined);

	/**
	 * Hydrate from IndexedDB on first navigation.  This is safe to call from
	 * the layout's `onMount` (browser-only); a no-op when running on the
	 * server.
	 */
	async hydrate(projectOfTab: (tabId: TabId) => ProjectId | undefined): Promise<void> {
		if (this.hydrated) return;
		this.hydrated = true;
		// Display preference: read synchronously from localStorage so the
		// strip never flashes visible-then-hidden on first paint.  Same
		// reason applies to the split ratio — the compare pane's width
		// should land at the user's preferred size instead of flashing at
		// 50% before IndexedDB comes back.
		this.readStripHiddenFromStorage();
		this.readSplitRatioFromStorage();
		const url = this.router.currentUrl();
		const urlState = parseWorkbenchUrl(url.pathname, url.searchParams);
		if (!urlState) {
			// Not a workbench path on cold start — leave the user on whatever
			// route they landed on (Today, Todos, …).  The previous working
			// set stays in IndexedDB until they next hit a `/notes/<id>`
			// URL, at which point the merge below enriches the deep link.
			// Still pick up the persisted strip-hidden and any pinned-tab
			// metadata so the strip renders correctly on non-note routes.
			try {
				const record = await this.repository.get();
				if (record) {
					if (typeof record.stripHidden === 'boolean') this.stripHidden = record.stripHidden;
					if (typeof record.splitRatio === 'number')
						this.splitRatio = WorkbenchStore.clampSplitRatio(record.splitRatio);
					this.pinnedTabs = record.pinnedTabs;
					this.recentlyUsed = record.recentlyUsed;
				}
				// audit-allow: silent-catch — corrupt workspace state is reported and URL state remains the explicit recovery source.
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : 'Workspace state could not be restored'
				);
			}
			void this.refreshActiveProjectId(projectOfTab);
			return;
		}
		// Deep link to `/notes/<id>`.  If a previous working set exists in
		// IndexedDB and contains the focused note, restore that richer set
		// instead of collapsing to a single tab — returning users get their
		// open tabs back; brand-new shares still see the single-note URL
		// because their IndexedDB record is empty.
		try {
			const record = await this.repository.get();
			if (record) {
				if (typeof record.stripHidden === 'boolean') this.stripHidden = record.stripHidden;
				if (typeof record.splitRatio === 'number')
					this.splitRatio = WorkbenchStore.clampSplitRatio(record.splitRatio);
				this.pinnedTabs = record.pinnedTabs;
				this.recentlyUsed = record.recentlyUsed;
			}
			if (
				record &&
				record.focusedNoteId &&
				record.openTabs.includes(urlState.focusedNoteId) &&
				(urlState.openTabs.length === 1 || record.openTabs.length > urlState.openTabs.length)
			) {
				// Preserve the deep-link's `?split=` if it survives against
				// the restored tab set; otherwise clear it.  `urlState`
				// carries it from the deep link so we pass it through.
				const restored: WorkbenchUrlState = {
					focusedNoteId: urlState.focusedNoteId,
					openTabs: record.openTabs,
					...(urlState.splitNoteId && record.openTabs.includes(urlState.splitNoteId)
						? { splitNoteId: urlState.splitNoteId }
						: {})
				};
				this.restoring = true;
				await this.router.goto(
					serializeWorkbenchUrl(restored, { conversationOf: this.conversationOf }),
					{
						replaceState: true,
						noScroll: true
					}
				);
				this.restoring = false;
				void this.refreshActiveProjectId(projectOfTab);
				return;
			}
			// audit-allow: silent-catch — tab restoration failure is reported before URL state is applied as recovery.
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Workspace tabs could not be restored');
		}
		this.applyUrlState(urlState);
		void this.refreshActiveProjectId(projectOfTab);
	}

	/**
	 * Reads the current URL into in-memory state.  Idempotent.  The layout's
	 * `$effect` calls this so the store always tracks SvelteKit's URL.
	 */
	syncFromUrl(): void {
		if (this.applyingFromUrl) return;
		const url = this.router.currentUrl();
		const urlState = parseWorkbenchUrl(url.pathname, url.searchParams);
		if (!urlState) {
			// Navigated away from `/notes/*` — leave the in-memory state alone;
			// the layout is going to render the standard outlet instead.
			return;
		}
		this.applyUrlState(urlState);
	}

	private applyUrlState(urlState: WorkbenchUrlState): void {
		if (
			this.focusedTabId === urlState.focusedNoteId &&
			this.openTabs.length === urlState.openTabs.length &&
			this.openTabs.every((id, i) => id === urlState.openTabs[i]) &&
			this.splitTabId === urlState.splitNoteId
		)
			return;
		this.applyingFromUrl = true;
		this.openTabs = urlState.openTabs;
		this.focusedTabId = urlState.focusedNoteId;
		this.splitTabId = urlState.splitNoteId;
		if (
			this.interactionFocusedTabId !== urlState.focusedNoteId &&
			this.interactionFocusedTabId !== urlState.splitNoteId
		)
			this.interactionFocusedTabId = urlState.focusedNoteId;
		// Only rebuild the MRU list when the focused tab isn't already at its head:
		// the layout's `$effect` reads `recentlyUsed` (via `pruneClosedNotes`) and
		// writes it here, so an unconditional new array is an effect feeding itself.
		if (this.recentlyUsed[0] !== urlState.focusedNoteId)
			this.recentlyUsed = [
				urlState.focusedNoteId,
				...this.recentlyUsed.filter((id) => id !== urlState.focusedNoteId)
			].slice(0, 16);
		this.applyingFromUrl = false;
		void this.persist();
	}

	/**
	 * Keep the active-project derived state in step with the shell's note
	 * tree.  Called by the layout whenever the shell reloads or the focused
	 * tab changes.
	 */
	refreshActiveProjectId(projectOfTab: (tabId: TabId) => ProjectId | undefined): void {
		const tabId = this.focusedTabId;
		this._activeProjectId = tabId ? projectOfTab(tabId) : undefined;
	}

	/** Returns the user's working set in URL-state form. */
	private toUrlState(): WorkbenchUrlState | undefined {
		if (!this.focusedTabId || this.openTabs.length === 0) return undefined;
		return {
			focusedNoteId: this.focusedTabId,
			openTabs: this.openTabs,
			...(this.splitTabId ? { splitNoteId: this.splitTabId } : {})
		};
	}

	/**
	 * Open a tab and focus it.  Pushes a new history entry (so the user can
	 * Back to the previously focused tab).
	 */
	async openTab(noteId: TabId): Promise<void> {
		const next = openTabInState(this.toUrlState(), noteId);
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/**
	 * Open two tabs at once: `tabId` focused, `splitTabId` beside it.
	 *
	 * `openTab` followed by `setSplit` is two navigations and therefore two
	 * history entries, so Back from a studio left the user in a half-opened
	 * state — chat with no canvas — which is not somewhere they ever were. This
	 * composes both transitions before navigating, so the pair opens and closes
	 * as the single act it is.
	 */
	async openSplit(tabId: TabId, splitTabId: TabId): Promise<void> {
		const opened = openTabInState(this.toUrlState(), tabId);
		const next = setSplitInState(opened, splitTabId);
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/** Focus an already-open tab.  Pushes a new history entry. */
	async focusTab(noteId: TabId): Promise<void> {
		const current = this.toUrlState();
		if (!current) {
			await this.openTab(noteId);
			return;
		}
		const next = focusTabInState(current, noteId);
		// Off a workbench route the strip's focus is the *last* session's, not where
		// the user is standing, so re-focusing the same tab is a real navigation back
		// into the workbench rather than the no-op it is on `/notes/*`.  Without this
		// the tab you arrived from is the one tab in the strip that does nothing.
		if (next === current && this.isWorkbenchPath) return;
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/** Close an open tab.  Pushes a new history entry; if the last tab is closed, redirects away from `/notes/*`. */
	async closeTab(noteId: TabId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		if (!this.isWorkbenchPath) {
			await this.closeInMemory([noteId]);
			return;
		}
		const next = closeTabInState(current, noteId, { recentlyUsed: this.recentlyUsed });
		if (!next) {
			// Closing the last tab navigates to Today.
			await this.clearToOverview({
				pinnedTabs: this.pinnedTabs,
				recentlyUsed: this.recentlyUsed
			});
			return;
		}
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/**
	 * Close several tabs at once (e.g. every tab of one project, or the whole
	 * strip).  Pinned tabs are closed too — a closed tab must not stay pinned.
	 * Pushes a new history entry; if every tab is closed, redirects away from
	 * `/notes/*`.
	 */
	async closeTabs(noteIds: readonly TabId[]): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		if (!this.isWorkbenchPath) {
			await this.closeInMemory(noteIds);
			return;
		}
		const next = closeTabsInState(current, noteIds, { recentlyUsed: this.recentlyUsed });
		if (next === current) return;
		this.pinnedTabs = this.pinnedTabs.filter((id) => !noteIds.includes(id));
		if (!next) {
			// Every tab closed (same as closeTab's last-tab branch).
			await this.clearToOverview({
				pinnedTabs: this.pinnedTabs,
				recentlyUsed: this.recentlyUsed
			});
			return;
		}
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/** Reorder a tab relative to another.  Replaces the current URL so Back doesn't walk reorderings. */
	async moveTab(from: TabId, to: TabId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = moveTabInState(current, from, to);
		if (next === current) return;
		await this.navigate(next, { replace: true, invalidate: false });
	}

	/** Add a tab without changing focus, split context, ordering, or strip visibility. */
	async openTabInBackground(noteId: TabId): Promise<void> {
		const current = this.toUrlState();
		const next = addTabInBackgroundInState(current, noteId);
		if (next === current) return;
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/**
	 * Open or close the split pane.  Pass a `noteId` to render that note
	 * alongside the focused pane (the helper opens it as a tab first if it
	 * isn't already).  Pass `undefined` to close the split — the underlying
	 * tab stays open in the strip.  Pushes a new history entry so Back
	 * restores the prior split state.
	 */
	async setSplit(noteId: TabId | undefined): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = setSplitInState(current, noteId);
		if (next === current) return;
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/**
	 * Swap an open tab for another one, keeping its place and its split side.
	 *
	 * What promotion needs: the studio's draft canvas becomes the saved diagram
	 * without the conversation beside it flickering or the split closing.
	 */
	async replaceTab(from: TabId, to: TabId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = replaceTabInState(current, from, to);
		if (next === current) return;
		this.pinnedTabs = this.pinnedTabs.map((id) => (id === from ? to : id));
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/** Pin or unpin a tab.  Persists the change without touching the URL. */
	togglePin(noteId: TabId): void {
		if (this.pinnedTabs.includes(noteId)) {
			this.pinnedTabs = this.pinnedTabs.filter((id) => id !== noteId);
		} else {
			this.pinnedTabs = [...this.pinnedTabs, noteId];
		}
		void this.persist();
	}

	isPinned(noteId: TabId): boolean {
		return this.pinnedTabs.includes(noteId);
	}

	/**
	 * Drop tabs whose note ids no longer exist in the shell's note tree
	 * (e.g. after a note is archived).  Replaces the URL if anything changed.
	 *
	 * Only navigates when the workbench is actually on screen.  Off `/notes/*`
	 * `syncFromUrl` stops applying the URL, so the in-memory tabs are the last
	 * workbench session's — real state worth pruning, but not something the URL
	 * represents.  Navigating from there would take the user somewhere they never
	 * asked to go (archiving from the sidebar on `/today` used to land them in the
	 * workbench) and, because the layout re-runs this on every navigation, the
	 * `goto` + `invalidateAll` would feed itself.
	 */
	async pruneClosedNotes(known: ReadonlySet<NoteId>): Promise<void> {
		if (this.pruning) return;
		const current = this.toUrlState();
		if (!current) return;
		// A chat tab is never in the note tree, so it must survive this on its own
		// terms — matching on `known` alone would close every chat tab on the first
		// navigation. Chats are closed explicitly instead, when their conversation
		// is deleted.
		const survives = (id: TabId): boolean => {
			const noteId = noteIdOf(id);
			return noteId === undefined || known.has(noteId);
		};
		const remaining = current.openTabs.filter(survives);
		if (remaining.length === current.openTabs.length) return;
		this.pruning = true;
		try {
			if (!this.isWorkbenchPath) {
				await this.pruneInMemory(survives, remaining);
				return;
			}
			if (remaining.length === 0) {
				await this.clearToOverview({
					pinnedTabs: this.pinnedTabs.filter(survives),
					recentlyUsed: this.recentlyUsed.filter(survives)
				});
				return;
			}
			const focused =
				current.focusedNoteId && survives(current.focusedNoteId)
					? current.focusedNoteId
					: (this.recentlyUsed.find(survives) ?? remaining[0]);
			// Drop the split if its note was pruned, or if it would collide with
			// the new focused pane (invariant: split ≠ focused).
			const split =
				current.splitNoteId &&
				survives(current.splitNoteId) &&
				current.splitNoteId !== focused &&
				remaining.includes(current.splitNoteId)
					? current.splitNoteId
					: undefined;
			await this.navigate(
				{
					focusedNoteId: focused,
					openTabs: remaining,
					...(split ? { splitNoteId: split } : {})
				},
				{ replace: true, invalidate: true }
			);
		} finally {
			this.pruning = false;
		}
	}

	/**
	 * Close tabs while the user is off `/notes/*`.  The strip is still on screen
	 * there, but its URL isn't: navigating to whatever survives would take the
	 * user into the workbench they had just left.  So the close lands in memory
	 * and the next workbench navigation serialises it.
	 */
	private async closeInMemory(noteIds: readonly TabId[]): Promise<void> {
		const survives = (id: TabId): boolean => !noteIds.includes(id);
		await this.pruneInMemory(survives, this.openTabs.filter(survives));
	}

	/**
	 * Prune without touching the URL, for when the strip isn't rendered — and for
	 * an explicit close off `/notes/*` (see `closeInMemory`).  The next `/notes/*`
	 * navigation serialises whatever survives here.
	 */
	private async pruneInMemory(
		survives: (id: TabId) => boolean,
		remaining: readonly TabId[]
	): Promise<void> {
		this.openTabs = remaining;
		this.pinnedTabs = this.pinnedTabs.filter(survives);
		this.recentlyUsed = this.recentlyUsed.filter(survives);
		if (this.splitTabId && !survives(this.splitTabId)) this.splitTabId = undefined;
		if (this.interactionFocusedTabId && !survives(this.interactionFocusedTabId))
			this.interactionFocusedTabId = undefined;
		if (!this.focusedTabId || !survives(this.focusedTabId))
			this.focusedTabId = this.recentlyUsed[0] ?? remaining[0];
		await this.persist();
	}

	/**
	 * Empty the strip and leave `/notes/*` for Today.  An empty strip has no
	 * URL representation, so this is the one state change that can't be driven
	 * through `navigate`.
	 *
	 * `applyingFromUrl` must stay set for the whole navigation, not just the
	 * assignments: clearing `focusedNoteId` invalidates the layout's `$effect`,
	 * which re-runs while `goto` is still in flight — at which point `page.url`
	 * is still the old `/notes/…?tabs=…`, and an unguarded `syncFromUrl` would
	 * parse it and put every tab straight back.  That's what made closing all
	 * tabs take two clicks.  By the time the guard is released the URL is
	 * `/today`, where `syncFromUrl` early-returns anyway.
	 *
	 * Persisting before `goto` keeps the IndexedDB record from being written
	 * from a half-torn-down state if the navigation is slow.
	 */
	private async clearToOverview(
		persistPatch: Pick<WorkbenchLayoutRecord, 'pinnedTabs' | 'recentlyUsed'>
	): Promise<void> {
		this.applyingFromUrl = true;
		this.openTabs = [];
		this.focusedTabId = undefined;
		this.splitTabId = undefined;
		try {
			await this.persist({ openTabs: [], focusedNoteId: null, ...persistPatch });
			await this.router.goto('/today', { replaceState: false });
		} finally {
			this.applyingFromUrl = false;
		}
	}

	private async navigate(
		next: WorkbenchUrlState,
		options: { replace: boolean; invalidate: boolean }
	): Promise<void> {
		const url = serializeWorkbenchUrl(next, { conversationOf: this.conversationOf });
		await this.router.goto(url, { replaceState: options.replace, noScroll: true });
		// `syncFromUrl` will pick this up via the layout's $effect, but
		// persisting eagerly avoids a brief window where the IndexedDB record
		// disagrees with the URL (e.g. a reload mid-navigation).
		await this.persist();
		if (options.invalidate) await this.router.invalidateAll();
	}

	private async persist(override?: Partial<WorkbenchLayoutRecord>): Promise<void> {
		if (this.restoring) return;
		const record: WorkbenchLayoutRecord = {
			id: 'current',
			openTabs: override?.openTabs ?? this.openTabs,
			focusedNoteId: override?.focusedNoteId ?? this.focusedTabId ?? null,
			pinnedTabs: override?.pinnedTabs ?? this.pinnedTabs,
			recentlyUsed: override?.recentlyUsed ?? this.recentlyUsed,
			stripHidden: override?.stripHidden ?? this.stripHidden,
			splitRatio: override?.splitRatio ?? this.splitRatio
		};
		try {
			await this.repository.put(record);
			// audit-allow: silent-catch — persistence failure is reported while the live workspace remains intact.
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Workspace state could not be saved');
		}
	}
}

export const workbench = new WorkbenchStore();
