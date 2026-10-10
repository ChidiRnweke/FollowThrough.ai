import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TabId, WorkbenchView } from '$lib/models/workbench';
import type { WorkbenchState } from '$lib/stores/workbench/state.svelte';
import type { WorkbenchRouter, WorkbenchUrlCodec, WorkbenchTabReader } from './contracts';
export class WorkbenchPresentation implements WorkbenchView {
	constructor(
		private readonly state: WorkbenchState,
		private readonly router: WorkbenchRouter,
		private readonly codec: WorkbenchUrlCodec,
		private readonly tabs: WorkbenchTabReader
	) {}
	get openTabs(): readonly TabId[] {
		return this.state.snapshot.openTabs;
	}
	get focusedTabId(): TabId | undefined {
		return this.state.snapshot.focusedTabId;
	}
	get interactionFocusedTabId(): TabId | undefined {
		return this.state.snapshot.interactionFocusedTabId;
	}
	get pinnedTabs(): readonly TabId[] {
		return this.state.snapshot.pinnedTabs;
	}
	get recentlyUsed(): readonly TabId[] {
		return this.state.snapshot.recentlyUsed;
	}
	get stripHidden(): boolean {
		return this.state.snapshot.stripHidden;
	}
	get splitTabId(): TabId | undefined {
		return this.state.snapshot.splitTabId;
	}
	get splitRatio(): number {
		return this.state.snapshot.splitRatio;
	}
	get activeProjectId(): ProjectId | undefined {
		return this.state.snapshot.activeProjectId;
	}

	get focusedNoteId(): NoteId | undefined {
		return this.focusedTabId ? this.tabs.note(this.focusedTabId) : undefined;
	}
	get interactionFocusedNoteId(): NoteId | undefined {
		return this.interactionFocusedTabId ? this.tabs.note(this.interactionFocusedTabId) : undefined;
	}
	get splitNoteId(): NoteId | undefined {
		return this.splitTabId ? this.tabs.note(this.splitTabId) : undefined;
	}
	get activeNoteId(): NoteId | undefined {
		return this.interactionFocusedNoteId ?? this.focusedNoteId;
	}
	get splitActive(): boolean {
		return (
			this.splitTabId !== undefined &&
			this.splitTabId !== this.focusedTabId &&
			this.openTabs.includes(this.splitTabId)
		);
	}
	get isWorkbenchPath(): boolean {
		const url = this.router.currentUrl();
		return this.codec.parse(url) !== undefined;
	}
}
