import type { NoteSummary } from '$lib/models/notes';
import { NOTE_DRAG_MIME, type NoteDragTransfer } from '$lib/client/notes/note-drag';
import { parseTabId, type TabId } from '$lib/stores/workbench/tab-ref';

export const TAB_DRAG_MIME = 'application/x-followthrough-tab';

const hasType = (dataTransfer: NoteDragTransfer, mime: string): boolean =>
	Array.from(dataTransfer.types).includes(mime);

/**
 * Writes a tab drag.
 *
 * A note tab also writes the older note-only MIME, so every drop target that
 * has not been generalised — the project tree, the sidebar — keeps accepting
 * notes dragged from the tab strip with no change of its own.
 */
export function writeTabDrag(dataTransfer: NoteDragTransfer, tabId: TabId): void {
	dataTransfer.effectAllowed = 'copy';
	dataTransfer.setData(TAB_DRAG_MIME, tabId);
	const ref = parseTabId(tabId);
	if (ref?.kind === 'note') dataTransfer.setData(NOTE_DRAG_MIME, ref.noteId);
}

export function hasInternalTabDrag(dataTransfer: NoteDragTransfer | null): boolean {
	return (
		dataTransfer !== null &&
		(hasType(dataTransfer, TAB_DRAG_MIME) || hasType(dataTransfer, NOTE_DRAG_MIME))
	);
}

/**
 * Reads a dropped tab, validating it against what can actually be shown.
 *
 * A note must still be a live note in the shell tree — the same check the
 * note-only reader has always made. A chat must be a tab that is currently
 * open, since its transcript lives in a registry keyed by that session and a
 * stale key would mount an empty pane.
 */
export function readActiveTabDrag(
	dataTransfer: NoteDragTransfer | null,
	noteTree: readonly NoteSummary[],
	openTabs: readonly TabId[]
): TabId | undefined {
	if (!dataTransfer) return undefined;
	const raw = hasType(dataTransfer, TAB_DRAG_MIME)
		? dataTransfer.getData(TAB_DRAG_MIME)
		: hasType(dataTransfer, NOTE_DRAG_MIME)
			? dataTransfer.getData(NOTE_DRAG_MIME)
			: undefined;
	if (!raw) return undefined;
	const ref = parseTabId(raw);
	if (!ref) return undefined;
	if (ref.kind === 'chat') return openTabs.includes(raw) ? raw : undefined;
	// The search tab is a singleton surface: dropping it anywhere meaningful is
	// just focusing it, which the strip already does on click.
	if (ref.kind !== 'note') return undefined;
	const note = noteTree.find((entry) => entry.id === ref.noteId);
	return note?.kind === 'note' && !note.archivedAt ? raw : undefined;
}
