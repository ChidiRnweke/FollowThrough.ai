import type { Todo, UpdateTodoInput } from '$lib/models/todos';
import type { DateTime } from '$lib/models/workspace';

/** Local preview of the same fields accepted by a todo edit. Null clears a nullable field. */
export function applyTodoEdit(
	todo: Todo,
	input: Omit<UpdateTodoInput, 'todoId'>,
	timestamp: DateTime
): Todo {
	const edited: Todo = {
		...todo,
		...(input.title !== undefined ? { title: input.title.trim() } : {}),
		...(input.description !== undefined ? { description: input.description ?? undefined } : {}),
		...(input.dueDate !== undefined ? { dueDate: input.dueDate ?? undefined } : {}),
		...(input.responsibility !== undefined ? { responsibility: input.responsibility } : {}),
		...(input.priority !== undefined ? { priority: input.priority ?? undefined } : {}),
		...(input.category !== undefined ? { category: input.category?.trim() || undefined } : {}),
		...(input.waitingOn !== undefined ? { waitingOn: input.waitingOn?.trim() || undefined } : {}),
		...(input.linkedNoteId !== undefined ? { linkedNoteId: input.linkedNoteId ?? undefined } : {}),
		...(input.status !== undefined && input.status !== todo.status
			? { status: input.status, completedAt: input.status === 'done' ? timestamp : undefined }
			: {}),
		updatedAt: timestamp
	};
	return { ...edited, waitingOn: edited.responsibility === 'mine' ? undefined : edited.waitingOn };
}
