import type { TextSelection } from '$lib/models/notes';
import { countWords } from '$lib/models/notes/reading-time';

/**
 * A passage of a note, pinned to the composer as context.
 *
 * The other chips stand for a whole resource, so the resource's own id identifies them. A
 * selection has no id of its own — one note can carry several pinned passages at once — so
 * the range identifies it. Deriving the id rather than minting one is what makes pinning the
 * same passage twice a no-op through `ChatStore.addChip`'s existing `kind + id` dedup.
 *
 * `text` is captured at pin time against a `revision`. That is the whole reason these chips
 * do not outlive the message they were pinned for: an excerpt held across turns would go on
 * describing a passage the note no longer contains.
 */
export interface SelectionChip {
	readonly kind: 'selection';
	readonly id: string;
	/** The note the passage came from. Chips are read at a glance, so the title is the label. */
	readonly name: string;
	readonly wordCount: number;
	readonly selection: TextSelection;
}

export const selectionChipIdOf = (selection: TextSelection): string =>
	`${selection.noteId}:${selection.from}-${selection.to}`;

export const selectionChipOf = (selection: TextSelection, noteTitle: string): SelectionChip => ({
	kind: 'selection',
	id: selectionChipIdOf(selection),
	name: noteTitle,
	wordCount: countWords(selection.text),
	selection
});

/**
 * The chip for whatever is highlighted in the focused note right now, or nothing.
 *
 * This is the ephemeral half of the pair: it follows the caret, it is never held in
 * `ChatStore.chips`, and it travels with the next message unless the user waves it away.
 * Pinning is what makes a passage stop moving.
 *
 * Suppressed once the same range has been pinned — the pin is the same passage said more
 * firmly, and two chips for one highlight would misstate what travels. Dismissal is keyed by
 * range for the same reason: waving this passage away should silence it, not the next one.
 */
export const liveSelectionChipOf = (
	selection: TextSelection | undefined,
	noteTitle: string,
	pinnedIds: readonly string[],
	dismissedId?: string
): SelectionChip | undefined => {
	if (!selection) return undefined;
	const id = selectionChipIdOf(selection);
	if (id === dismissedId || pinnedIds.includes(id)) return undefined;
	return selectionChipOf(selection, noteTitle);
};
