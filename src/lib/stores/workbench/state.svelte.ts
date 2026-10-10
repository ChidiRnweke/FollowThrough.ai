import type { WorkbenchSnapshot } from '$lib/models/workbench';

/** Account-owned reactive layout values. Updates contain decisions already made by controllers. */
export class WorkbenchState {
	private value = $state<WorkbenchSnapshot>({
		openTabs: [],
		focusedTabId: undefined,
		interactionFocusedTabId: undefined,
		pinnedTabs: [],
		recentlyUsed: [],
		stripHidden: false,
		splitTabId: undefined,
		splitRatio: 0.5,
		activeProjectId: undefined
	});
	get snapshot(): WorkbenchSnapshot {
		return this.value;
	}
	update(patch: Partial<WorkbenchSnapshot>): void {
		Object.assign(this.value, patch);
	}
}
