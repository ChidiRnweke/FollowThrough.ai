import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/state';
import type { NoteId, ProjectId } from '$lib/models';
import {
	IndexedDbWorkspaceRepository,
	type WorkspaceRecord
} from '$lib/client/note-sync/indexeddb-workspace-repository';
import {
	closeTabInState,
	focusTabInState,
	moveTabInState,
	openTabInState,
	parseWorkbenchUrl,
	serializeWorkbenchUrl,
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
	pinnedTabs = $state<readonly NoteId[]>([]);

	/** Recently-focused tabs, most-recent first.  Used to pick a tab to focus when the active one closes. */
	recentlyUsed = $state<readonly NoteId[]>([]);

	private repository = new IndexedDbWorkspaceRepository();
	private hydrated = $state(false);
	/** Suppresses the URL→state effect while we're applying a user action this tick. */
	private applyingFromUrl = false;
	/** Suppresses persistence while we're restoring from IndexedDB on first load. */
	private restoring = false;

	/**
	 * Returns `true` when the current URL is a workbench path (`/notes/<id>`).
	 * The layout uses this to decide whether to render the workbench shell or
	 * the standard `{@render children()}` outlet.
	 */
	get isWorkbenchPath(): boolean {
		return parseWorkbenchUrl(page.url.pathname, page.url.searchParams) !== undefined;
	}

	/** A view of the focused pane's NoteId; mirrors `focusedNoteId` for ergonomic consumers. */
	get activeNoteId(): NoteId | undefined {
		return this.focusedNoteId;
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
		const urlState = parseWorkbenchUrl(page.url.pathname, page.url.searchParams);
		if (!urlState) {
			// Not a workbench path on cold start — leave the user on whatever
			// route they landed on (Today, Todos, …).  The previous working
			// set stays in IndexedDB until they next hit a `/notes/<id>`
			// URL, at which point the merge below enriches the deep link.
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
			if (
				record &&
				record.focusedNoteId &&
				record.openTabs.includes(urlState.focusedNoteId) &&
				(urlState.openTabs.length === 1 || record.openTabs.length > urlState.openTabs.length)
			) {
				this.pinnedTabs = record.pinnedTabs;
				this.recentlyUsed = record.recentlyUsed;
				const restored: WorkbenchUrlState = {
					focusedNoteId: urlState.focusedNoteId,
					openTabs: record.openTabs
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
			this.openTabs.every((id, i) => id === urlState.openTabs[i])
		)
			return;
		this.applyingFromUrl = true;
		this.openTabs = urlState.openTabs;
		this.focusedNoteId = urlState.focusedNoteId;
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
		return { focusedNoteId: this.focusedNoteId, openTabs: this.openTabs };
	}

	/**
	 * Open a tab and focus it.  Pushes a new history entry (so the user can
	 * Back to the previously focused tab).
	 */
	async openTab(noteId: NoteId): Promise<void> {
		const next = openTabInState(this.toUrlState(), noteId);
		await this.navigate(next, /* replace */ false);
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
		await this.navigate(next, /* replace */ false);
	}

	/** Close an open tab.  Pushes a new history entry; if the last tab is closed, redirects away from `/notes/*`. */
	async closeTab(noteId: NoteId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = closeTabInState(current, noteId, { recentlyUsed: this.recentlyUsed });
		if (!next) {
			// Closing the last tab navigates to Today.  Remove from open list,
			// clear focus, and let the URL change drive the layout swap.
			this.applyingFromUrl = true;
			this.openTabs = [];
			this.focusedNoteId = undefined;
			this.applyingFromUrl = false;
			await goto('/', { replaceState: false });
			await this.persist({
				openTabs: [],
				focusedNoteId: null,
				pinnedTabs: this.pinnedTabs,
				recentlyUsed: this.recentlyUsed
			});
			return;
		}
		await this.navigate(next, /* replace */ false);
	}

	/** Reorder a tab relative to another.  Replaces the current URL so Back doesn't walk reorderings. */
	async moveTab(from: NoteId, to: NoteId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = moveTabInState(current, from, to);
		if (next === current) return;
		await this.navigate(next, /* replace */ true);
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
			this.applyingFromUrl = false;
			await goto('/', { replaceState: false });
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
		await this.navigate({ focusedNoteId: focused, openTabs: remaining }, /* replace */ true);
	}

	private async navigate(next: WorkbenchUrlState, replace: boolean): Promise<void> {
		const url = serializeWorkbenchUrl(next);
		await goto(url, { replaceState: replace, noScroll: true });
		// `syncFromUrl` will pick this up via the layout's $effect, but
		// persisting eagerly avoids a brief window where the IndexedDB record
		// disagrees with the URL (e.g. a reload mid-navigation).
		await this.persist();
		await invalidateAll();
	}

	private async persist(override?: Partial<WorkspaceRecord>): Promise<void> {
		if (this.restoring) return;
		const record: WorkspaceRecord = {
			id: 'current',
			openTabs: override?.openTabs ?? this.openTabs,
			focusedNoteId: override?.focusedNoteId ?? this.focusedNoteId ?? null,
			pinnedTabs: override?.pinnedTabs ?? this.pinnedTabs,
			recentlyUsed: override?.recentlyUsed ?? this.recentlyUsed
		};
		try {
			await this.repository.put(record);
		} catch {
			// IndexedDB may be unavailable; the URL remains canonical.
		}
	}
}

export const workbench = new WorkbenchStore();
