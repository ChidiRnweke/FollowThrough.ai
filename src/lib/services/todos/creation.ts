import type { CreateTodoInput, Todo, TodoId } from '$lib/models/todos';
import type { DateTime } from '$lib/models/workspace';

/** Produce the initial task state without generating identities or writing storage. */
export function decideTodoCreation(
	input: CreateTodoInput,
	context: { readonly id: TodoId; readonly userId: Todo['userId']; readonly timestamp: DateTime }
): { kind: 'invalid'; message: string } | { kind: 'create'; todo: Todo } {
	const title = input.title.trim();
	if (!title) return { kind: 'invalid', message: 'Todo title is required' };
	const todo: Todo = {
		id: context.id,
		userId: context.userId,
		projectId: input.projectId,
		title,
		...(input.description !== undefined ? { description: input.description } : {}),
		status: input.status ?? 'open',
		responsibility: input.responsibility,
		...(input.responsibility === 'waiting_on' && input.waitingOn?.trim()
			? { waitingOn: input.waitingOn.trim() }
			: {}),
		...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
		...(input.dueDateVerbatim !== undefined ? { dueDateVerbatim: input.dueDateVerbatim } : {}),
		...(input.promiseStrength !== undefined ? { promiseStrength: input.promiseStrength } : {}),
		...(input.sourceAnchorId !== undefined ? { sourceAnchorId: input.sourceAnchorId } : {}),
		...(input.provenanceId !== undefined ? { provenanceId: input.provenanceId } : {}),
		...(input.status === 'done' ? { completedAt: context.timestamp } : {}),
		createdAt: context.timestamp,
		updatedAt: context.timestamp
	};
	return { kind: 'create', todo };
}
