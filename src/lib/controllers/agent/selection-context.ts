import type { TextSelection } from '$lib/models/notes';
import type { SelectionChip, NoteSelectionContext } from '$lib/models/chat';
import type { SelectionContextRules } from '$lib/services/agent/selection-context';
import type { NoteReadingStatistics } from '$lib/services/notes/reading-statistics';
export interface AgentSelectionContextController {
	pin(selection: TextSelection, noteTitle: string): SelectionChip;
	live(
		context: NoteSelectionContext,
		pinnedIds: readonly string[],
		dismissedId?: string
	): SelectionChip | undefined;
}
export class AgentSelectionContext implements AgentSelectionContextController {
	constructor(
		private readonly rules: SelectionContextRules,
		private readonly reading: NoteReadingStatistics
	) {}
	pin(selection: TextSelection, noteTitle: string): SelectionChip {
		return this.rules.pin(selection, noteTitle, this.reading.wordCount(selection.text));
	}
	live(
		context: NoteSelectionContext,
		pinnedIds: readonly string[],
		dismissedId?: string
	): SelectionChip | undefined {
		if (context.kind === 'none') return undefined;
		return this.rules.live(this.pin(context.selection, context.noteTitle), pinnedIds, dismissedId);
	}
}
