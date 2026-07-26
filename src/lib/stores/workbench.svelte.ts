import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import type { NoteId, ProjectId } from '$lib/models';
import {
	IndexedDbWorkspaceRepository,
	type WorkspaceRecord
} from '$lib/client/note-sync/indexeddb-workspace-repository';
import {
	addTabInBackgroundInState,
	closeTabInState,
	focusTabInState,
	moveTabInState,
	openTabInState,
	parseWorkbenchUrl,
	serializeWorkbenchUrl,
	setSplitInState,
	type WorkbenchUrlState
} from './workbench-url';

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
class WorkbenchStore {
	openTabs = $state<readonly NoteId[]>([]);
	focusedNoteId = $state<NoteId | undefined>(undefined);
	/** Pane that most recently received real user interaction; distinct from URL-primary focus. */
	interactionFocusedNoteId = $state<NoteId | undefined>(undefined);
	pinnedTabs = $state<readonly NoteId[]>([]);

	/** Recently-focused tabs, most-recent first.  Used to pick a tab to focus when the active one closes. */
	recentlyUsed = $state<readonly NoteId[]>([]);

	/**
	 * Whether the user has collapsed the global tab strip.  Display
	 * preference only — does not affect open-tab state.  Persists in
	 * localStorage (fast first-paint read) and in the IndexedDB
	 * `WorkspaceRecord` (cross-device source of truth).
	 */
	stripHidden = $state(false);

	/**
	 * The note currently shown in the secondary (split) pane, or
	 * `undefined` when there is no split.  URL-canonical via `?split=`, so
	 * this field mirrors `page.url` rather than being independently
	 * persisted.  Always distinct from `focusedNoteId` (invariant: a note
	 * can't be both primary and split).
	 */
	splitNoteId = $state<NoteId | undefined>(undefined);

	/**
	 * Width of the secondary pane as a fraction of 1 (clamped 0.25–0.75).
	 * Display preference — like `stripHidden`, persists to localStorage
	 * for instant first-paint and to the IndexedDB `WorkspaceRecord` for
	 * cross-device synchronisation.  The URL never encodes the ratio.
	 */
	splitRatio = $state(0.5);

	private repository = new IndexedDbWorkspaceRepository();
	private hydrated = $state(false);
	/** Suppresses the URL→state effect while we're applying a user action this tick. */
	private applyingFromUrl = false;
	/** Suppresses persistence while we're restoring from IndexedDB on first load. */
	private restoring = false;

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
		return parseWorkbenchUrl(page.url.pathname, page.url.searchParams) !== undefined;
	}

	/**
	 * Whether a second pane is actually on screen.  A `splitNoteId` alone is not
	 * enough: it must differ from the focused note and still be open as a tab.
	 * Lives here so the panes and the sidebar's space cue agree on one rule.
	 */
	get splitActive(): boolean {
		return (
			this.splitNoteId !== undefined &&
			this.splitNoteId !== this.focusedNoteId &&
			this.openTabs.includes(this.splitNoteId)
		);
	}

	/** A view of the focused pane's NoteId; mirrors `focusedNoteId` for ergonomic consumers. */
	get activeNoteId(): NoteId | undefined {
		return this.interactionFocusedNoteId ?? this.focusedNoteId;
	}

	setInteractionFocus(noteId: NoteId): void {
		if (noteId === this.focusedNoteId || noteId === this.splitNoteId)
			this.interactionFocusedNoteId = noteId;
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
	async hydrate(shellProjectOf: (noteId: NoteId) => ProjectId | undefined): Promise<void> {
		if (this.hydrated) return;
		this.hydrated = true;
		// Display preference: read synchronously from localStorage so the
		// strip never flashes visible-then-hidden on first paint.  Same
		// reason applies to the split ratio — the compare pane's width
		// should land at the user's preferred size instead of flashing at
		// 50% before IndexedDB comes back.
		this.readStripHiddenFromStorage();
		this.readSplitRatioFromStorage();
		const urlState = parseWorkbenchUrl(page.url.pathname, page.url.searchParams);
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
			} catch {
				// IndexedDB may be unavailable; localStorage remains canonical.
			}
			void this.refreshActiveProjectId(shellProjectOf);
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
				await goto(serializeWorkbenchUrl(restored), { replaceState: true, noScroll: true });
				this.restoring = false;
				void this.refreshActiveProjectId(shellProjectOf);
				return;
			}
		} catch {
			// IndexedDB may be unavailable; URL remains canonical.
		}
		this.applyUrlState(urlState);
		void this.refreshActiveProjectId(shellProjectOf);
	}

	/**
	 * Reads the current URL into in-memory state.  Idempotent.  The layout's
	 * `$effect` calls this so the store always tracks SvelteKit's URL.
	 */
	syncFromUrl(): void {
		if (this.applyingFromUrl) return;
		const urlState = parseWorkbenchUrl(page.url.pathname, page.url.searchParams);
		if (!urlState) {
			// Navigated away from `/notes/*` — leave the in-memory state alone;
			// the layout is going to render the standard outlet instead.
			return;
		}
		this.applyUrlState(urlState);
	}

	private applyUrlState(urlState: WorkbenchUrlState): void {
		if (
			this.focusedNoteId === urlState.focusedNoteId &&
			this.openTabs.length === urlState.openTabs.length &&
			this.openTabs.every((id, i) => id === urlState.openTabs[i]) &&
			this.splitNoteId === urlState.splitNoteId
		)
			return;
		this.applyingFromUrl = true;
		this.openTabs = urlState.openTabs;
		this.focusedNoteId = urlState.focusedNoteId;
		this.splitNoteId = urlState.splitNoteId;
		if (
			this.interactionFocusedNoteId !== urlState.focusedNoteId &&
			this.interactionFocusedNoteId !== urlState.splitNoteId
		)
			this.interactionFocusedNoteId = urlState.focusedNoteId;
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
	refreshActiveProjectId(shellProjectOf: (noteId: NoteId) => ProjectId | undefined): void {
		this._activeProjectId = this.focusedNoteId ? shellProjectOf(this.focusedNoteId) : undefined;
	}

	/** Returns the user's working set in URL-state form. */
	private toUrlState(): WorkbenchUrlState | undefined {
		if (!this.focusedNoteId || this.openTabs.length === 0) return undefined;
		return {
			focusedNoteId: this.focusedNoteId,
			openTabs: this.openTabs,
			...(this.splitNoteId ? { splitNoteId: this.splitNoteId } : {})
		};
	}

	/**
	 * Open a tab and focus it.  Pushes a new history entry (so the user can
	 * Back to the previously focused tab).
	 */
	async openTab(noteId: NoteId): Promise<void> {
		const next = openTabInState(this.toUrlState(), noteId);
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/** Focus an already-open tab.  Pushes a new history entry. */
	async focusTab(noteId: NoteId): Promise<void> {
		const current = this.toUrlState();
		if (!current) {
			await this.openTab(noteId);
			return;
		}
		const next = focusTabInState(current, noteId);
		if (next === current) return;
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/** Close an open tab.  Pushes a new history entry; if the last tab is closed, redirects away from `/notes/*`. */
	async closeTab(noteId: NoteId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = closeTabInState(current, noteId, { recentlyUsed: this.recentlyUsed });
		if (!next) {
			// Closing the last tab navigates to Today.  Remove from open list,
			// clear focus and split, and let the URL change drive the layout swap.
			this.applyingFromUrl = true;
			this.openTabs = [];
			this.focusedNoteId = undefined;
			this.splitNoteId = undefined;
			this.applyingFromUrl = false;
			await goto('/today', { replaceState: false });
			await this.persist({
				openTabs: [],
				focusedNoteId: null,
				pinnedTabs: this.pinnedTabs,
				recentlyUsed: this.recentlyUsed
			});
			return;
		}
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/** Reorder a tab relative to another.  Replaces the current URL so Back doesn't walk reorderings. */
	async moveTab(from: NoteId, to: NoteId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = moveTabInState(current, from, to);
		if (next === current) return;
		await this.navigate(next, { replace: true, invalidate: false });
	}

	/** Add a tab without changing focus, split context, ordering, or strip visibility. */
	async openTabInBackground(noteId: NoteId): Promise<void> {
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
	async setSplit(noteId: NoteId | undefined): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = setSplitInState(current, noteId);
		if (next === current) return;
		await this.navigate(next, { replace: false, invalidate: false });
	}

	/** Pin or unpin a tab.  Persists the change without touching the URL. */
	togglePin(noteId: NoteId): void {
		if (this.pinnedTabs.includes(noteId)) {
			this.pinnedTabs = this.pinnedTabs.filter((id) => id !== noteId);
		} else {
			this.pinnedTabs = [...this.pinnedTabs, noteId];
		}
		void this.persist();
	}

	isPinned(noteId: NoteId): boolean {
		return this.pinnedTabs.includes(noteId);
	}

	/**
	 * Drop tabs whose note ids no longer exist in the shell's note tree
	 * (e.g. after a note is archived).  Replaces the URL if anything changed.
	 */
	async pruneClosedNotes(known: ReadonlySet<NoteId>): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const remaining = current.openTabs.filter((id) => known.has(id));
		if (remaining.length === current.openTabs.length) return;
		if (remaining.length === 0) {
			this.applyingFromUrl = true;
			this.openTabs = [];
			this.focusedNoteId = undefined;
			this.splitNoteId = undefined;
			this.applyingFromUrl = false;
			await goto('/today', { replaceState: false });
			await this.persist({
				openTabs: [],
				focusedNoteId: null,
				pinnedTabs: this.pinnedTabs.filter((id) => known.has(id)),
				recentlyUsed: this.recentlyUsed.filter((id) => known.has(id))
			});
			return;
		}
		const focused =
			current.focusedNoteId && known.has(current.focusedNoteId)
				? current.focusedNoteId
				: (this.recentlyUsed.find((id) => known.has(id)) ?? remaining[0]);
		// Drop the split if its note was pruned, or if it would collide with
		// the new focused pane (invariant: split ≠ focused).
		const split =
			current.splitNoteId &&
			known.has(current.splitNoteId) &&
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
	}

	private async navigate(
		next: WorkbenchUrlState,
		options: { replace: boolean; invalidate: boolean }
	): Promise<void> {
		const url = serializeWorkbenchUrl(next);
		await goto(url, { replaceState: options.replace, noScroll: true });
		// `syncFromUrl` will pick this up via the layout's $effect, but
		// persisting eagerly avoids a brief window where the IndexedDB record
		// disagrees with the URL (e.g. a reload mid-navigation).
		await this.persist();
		if (options.invalidate) await invalidateAll();
	}

	private async persist(override?: Partial<WorkspaceRecord>): Promise<void> {
		if (this.restoring) return;
		const record: WorkspaceRecord = {
			id: 'current',
			openTabs: override?.openTabs ?? this.openTabs,
			focusedNoteId: override?.focusedNoteId ?? this.focusedNoteId ?? null,
			pinnedTabs: override?.pinnedTabs ?? this.pinnedTabs,
			recentlyUsed: override?.recentlyUsed ?? this.recentlyUsed,
			stripHidden: override?.stripHidden ?? this.stripHidden,
			splitRatio: override?.splitRatio ?? this.splitRatio
		};
		try {
			await this.repository.put(record);
		} catch {
			// IndexedDB may be unavailable; the URL remains canonical.
		}
	}
}

export const workbench = new WorkbenchStore();
