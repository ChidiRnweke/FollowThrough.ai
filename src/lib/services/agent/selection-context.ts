import type { TextSelection } from '$lib/models/notes';
import type { SelectionChip } from '$lib/models/chat';
export interface SelectionContextRules {
	pin(selection: TextSelection, noteTitle: string, wordCount: number): SelectionChip;
	live(
		chip: SelectionChip,
		pinnedIds: readonly string[],
		dismissedId?: string
	): SelectionChip | undefined;
}
/** A passage is identified by its note and range; revision/text remain frozen on the chip. */
export class SelectionContextService implements SelectionContextRules {
	pin(selection: TextSelection, noteTitle: string, wordCount: number): SelectionChip {
		return {
			kind: 'selection',
			id: `${selection.noteId}:${selection.from}-${selection.to}`,
			name: noteTitle,
			wordCount,
			selection
		};
	}
	live(
		chip: SelectionChip,
		pinnedIds: readonly string[],
		dismissedId?: string
	): SelectionChip | undefined {
		return chip.id === dismissedId || pinnedIds.includes(chip.id) ? undefined : chip;
	}
}
