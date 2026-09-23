import type { Todo, UpdateTodoInput } from '$lib/models/todos';
import type { DateTime } from '$lib/models/workspace';

/** Local preview of the same fields accepted by a todo edit. Null clears a nullable field. */
export function applyTodoEdit(
	todo: Todo,
	input: Omit<UpdateTodoInput, 'todoId'>,
	timestamp: DateTime
): Todo {
	const edited = {
		...todo,
		...(input.title !== undefined ? { title: input.title.trim() } : {}),
		...(input.description !== undefined ? { description: input.description ?? undefined } : {}),
		...(input.dueDate !== undefined ? { dueDate: input.dueDate ?? undefined } : {}),
		...(input.responsibility !== undefined ? { responsibility: input.responsibility } : {}),
		...(input.priority !== undefined ? { priority: input.priority ?? undefined } : {}),
		...(input.category !== undefined ? { category: input.category?.trim() || undefined } : {}),
		...(input.waitingOn !== undefined ? { waitingOn: input.waitingOn?.trim() || undefined } : {}),
		...(input.linkedNoteId !== undefined ? { linkedNoteId: input.linkedNoteId ?? undefined } : {}),
		updatedAt: timestamp
	};
	const fields = {
		...edited,
		waitingOn: edited.responsibility === 'mine' ? undefined : edited.waitingOn
	};
	const status = input.status ?? todo.status;
	return status === 'done'
		? { ...fields, status, completedAt: todo.status === 'done' ? todo.completedAt : timestamp }
		: { ...fields, status, completedAt: undefined };
}
