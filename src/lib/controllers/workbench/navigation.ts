import type { NoteId } from '$lib/models/notes';
import type { TabId, WorkbenchUrlState, WorkbenchView } from '$lib/models/workbench';
import type { WorkbenchState } from '$lib/stores/workbench/state.svelte';
import type { WorkbenchLifecycleState } from '$lib/stores/workbench/lifecycle';
import type {
	WorkbenchNavigationController,
	WorkbenchPruning,
	WorkbenchNavigationEffects,
	WorkbenchTabReader
} from './contracts';
import type { WorkbenchTransitions } from '$lib/services/workbench/transitions';
export class WorkbenchNavigation implements WorkbenchNavigationController, WorkbenchPruning {
	constructor(
		private readonly state: WorkbenchState,
		private readonly lifecycle: WorkbenchLifecycleState,
		private readonly view: WorkbenchView,
		private readonly effects: WorkbenchNavigationEffects,
		private readonly transitions: WorkbenchTransitions,
		private readonly tabs: WorkbenchTabReader
	) {}

	private toUrlState(): WorkbenchUrlState | undefined {
		if (!this.state.snapshot.focusedTabId || this.state.snapshot.openTabs.length === 0)
			return undefined;
		return {
			focusedNoteId: this.state.snapshot.focusedTabId,
			openTabs: this.state.snapshot.openTabs,
			...(this.state.snapshot.splitTabId ? { splitNoteId: this.state.snapshot.splitTabId } : {})
		};
	}

	setInteractionFocus(noteId: TabId): void {
		if (noteId === this.state.snapshot.focusedTabId || noteId === this.state.snapshot.splitTabId)
			this.state.update({ interactionFocusedTabId: noteId });
	}

	async openTab(noteId: TabId): Promise<void> {
		const next = this.transitions.openTab(this.toUrlState(), noteId);
		await this.effects.navigate(next, { replace: false });
	}

	async openSplit(tabId: TabId, splitTabId: TabId): Promise<void> {
		const opened = this.transitions.openTab(this.toUrlState(), tabId);
		const next = this.transitions.setSplit(opened, splitTabId);
		await this.effects.navigate(next, { replace: false });
	}

	async focusTab(noteId: TabId): Promise<void> {
		const current = this.toUrlState();
		if (!current) {
			await this.openTab(noteId);
			return;
		}
		const next = this.transitions.focusTab(current, noteId);
		// Off a workbench route the strip's focus is the *last* session's, not where
		// the user is standing, so re-focusing the same tab is a real navigation back
		// into the workbench rather than the no-op it is on `/notes/*`.  Without this
		// the tab you arrived from is the one tab in the strip that does nothing.
		if (next === current && this.view.isWorkbenchPath) return;
		await this.effects.navigate(next, { replace: false });
	}

	async closeTab(noteId: TabId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		if (!this.view.isWorkbenchPath) {
			await this.closeInMemory([noteId]);
			return;
		}
		const next = this.transitions.closeTab(current, noteId, {
			recentlyUsed: this.state.snapshot.recentlyUsed
		});
		if (!next) {
			// Closing the last tab navigates to Today.
			await this.effects.clearToOverview({
				pinnedTabs: this.state.snapshot.pinnedTabs,
				recentlyUsed: this.state.snapshot.recentlyUsed
			});
			return;
		}
		await this.effects.navigate(next, { replace: false });
	}

	async closeTabs(noteIds: readonly TabId[]): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		if (!this.view.isWorkbenchPath) {
			await this.closeInMemory(noteIds);
			return;
		}
		const next = this.transitions.closeTabs(current, noteIds, {
			recentlyUsed: this.state.snapshot.recentlyUsed
		});
		if (next === current) return;
		this.state.update({
			pinnedTabs: this.state.snapshot.pinnedTabs.filter((id) => !noteIds.includes(id))
		});
		if (!next) {
			// Every tab closed (same as closeTab's last-tab branch).
			await this.effects.clearToOverview({
				pinnedTabs: this.state.snapshot.pinnedTabs,
				recentlyUsed: this.state.snapshot.recentlyUsed
			});
			return;
		}
		await this.effects.navigate(next, { replace: false });
	}

	async moveTab(from: TabId, to: TabId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = this.transitions.moveTab(current, from, to);
		if (next === current) return;
		await this.effects.navigate(next, { replace: true });
	}

	async openTabInBackground(noteId: TabId): Promise<void> {
		const current = this.toUrlState();
		const next = this.transitions.addTabInBackground(current, noteId);
		if (next === current) return;
		await this.effects.navigate(next, { replace: false });
	}

	async setSplit(noteId: TabId | undefined): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = this.transitions.setSplit(current, noteId);
		if (next === current) return;
		await this.effects.navigate(next, { replace: false });
	}

	async replaceTab(from: TabId, to: TabId): Promise<void> {
		const current = this.toUrlState();
		if (!current) return;
		const next = this.transitions.replaceTab(current, from, to);
		if (next === current) return;
		this.state.update({
			pinnedTabs: this.state.snapshot.pinnedTabs.map((id) => (id === from ? to : id))
		});
		await this.effects.navigate(next, { replace: false });
	}

	async pruneClosedNotes(known: ReadonlySet<NoteId>): Promise<void> {
		const generation = this.lifecycle.generation;
		if (this.lifecycle.pruning) return;
		const current = this.toUrlState();
		if (!current) return;
		// A chat tab is never in the note tree, so it must survive this on its own
		// terms — matching on `known` alone would close every chat tab on the first
		// navigation. Chats are closed explicitly instead, when their conversation
		// is deleted.
		const survives = (id: TabId): boolean => {
			const noteId = this.tabs.note(id);
			return noteId === undefined || known.has(noteId);
		};
		const remaining = current.openTabs.filter(survives);
		if (remaining.length === current.openTabs.length) return;
		this.lifecycle.pruning = true;
		try {
			if (!this.view.isWorkbenchPath) {
				await this.pruneInMemory(survives, remaining);
				return;
			}
			if (remaining.length === 0) {
				await this.effects.clearToOverview({
					pinnedTabs: this.state.snapshot.pinnedTabs.filter(survives),
					recentlyUsed: this.state.snapshot.recentlyUsed.filter(survives)
				});
				return;
			}
			const focused =
				current.focusedNoteId && survives(current.focusedNoteId)
					? current.focusedNoteId
					: (this.state.snapshot.recentlyUsed.find(survives) ?? remaining[0]);
			// Drop the split if its note was pruned, or if it would collide with
			// the new focused pane (invariant: split ≠ focused).
			const split =
				current.splitNoteId &&
				survives(current.splitNoteId) &&
				current.splitNoteId !== focused &&
				remaining.includes(current.splitNoteId)
					? current.splitNoteId
					: undefined;
			await this.effects.navigate(
				{
					focusedNoteId: focused,
					openTabs: remaining,
					...(split ? { splitNoteId: split } : {})
				},
				{ replace: true }
			);
		} finally {
			if (generation === this.lifecycle.generation) this.lifecycle.pruning = false;
		}
	}

	private async closeInMemory(noteIds: readonly TabId[]): Promise<void> {
		const survives = (id: TabId): boolean => !noteIds.includes(id);
		await this.pruneInMemory(survives, this.state.snapshot.openTabs.filter(survives));
	}

	private async pruneInMemory(
		survives: (id: TabId) => boolean,
		remaining: readonly TabId[]
	): Promise<void> {
		this.state.update({ openTabs: remaining });
		this.state.update({ pinnedTabs: this.state.snapshot.pinnedTabs.filter(survives) });
		this.state.update({ recentlyUsed: this.state.snapshot.recentlyUsed.filter(survives) });
		if (this.state.snapshot.splitTabId && !survives(this.state.snapshot.splitTabId))
			this.state.update({ splitTabId: undefined });
		if (
			this.state.snapshot.interactionFocusedTabId &&
			!survives(this.state.snapshot.interactionFocusedTabId)
		)
			this.state.update({ interactionFocusedTabId: undefined });
		if (!this.state.snapshot.focusedTabId || !survives(this.state.snapshot.focusedTabId))
			this.state.update({ focusedTabId: this.state.snapshot.recentlyUsed[0] ?? remaining[0] });
		await this.effects.persist();
	}
}
