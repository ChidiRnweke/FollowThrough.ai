import type { TodayFacts, TodayView } from '$lib/models/workspace';
import type { TodoView } from '$lib/models/todos';
import type { NoteSummary } from '$lib/models/notes';

/** Group resolved work against the caller's local date, without reading a clock or storage. */
export function assembleToday<
	Task extends Pick<TodoView, 'todo'>,
	Note extends Pick<NoteSummary, 'updatedAt' | 'isPinned'>
>(facts: TodayFacts<Task, Note>): TodayView<Task, Note> {
	return {
		overdue: facts.due.filter(
			({ todo }) => todo.dueDate !== undefined && todo.dueDate < facts.today
		),
		dueToday: facts.due.filter(({ todo }) => todo.dueDate === facts.today),
		waitingOn: facts.waiting,
		pendingSuggestionCount: facts.pendingSuggestionCount,
		pinnedNotes: facts.notes.filter((note) => note.isPinned),
		// Preserve the existing five-row presentation without truncating the source inventory.
		recentNotes: [...facts.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
	};
}
