import type { Todo, TodoId, CreateTodoInput, UpdateTodoInput } from '$lib/models/todos';
import type { DateTime } from '$lib/models/workspace';

/** Local preview of the same fields accepted by a todo edit. Null clears a nullable field. */
function applyTodoEdit(
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

const hasTodoEdits = (input: UpdateTodoInput): boolean =>
	Object.keys(input).some((key) => key !== 'todoId');

/** Produce the initial task state without generating identities or writing storage. */
function decideTodoCreation(
	input: CreateTodoInput,
	context: { readonly id: TodoId; readonly userId: Todo['userId']; readonly timestamp: DateTime }
): { kind: 'invalid'; message: string } | { kind: 'create'; todo: Todo } {
	const title = input.title.trim();
	if (!title) return { kind: 'invalid', message: 'Todo title is required' };
	const fields = {
		id: context.id,
		userId: context.userId,
		projectId: input.projectId,
		title,
		...(input.description !== undefined ? { description: input.description } : {}),
		responsibility: input.responsibility,
		...(input.responsibility === 'waiting_on' && input.waitingOn?.trim()
			? { waitingOn: input.waitingOn.trim() }
			: {}),
		...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
		...(input.dueDateVerbatim !== undefined ? { dueDateVerbatim: input.dueDateVerbatim } : {}),
		...(input.promiseStrength !== undefined ? { promiseStrength: input.promiseStrength } : {}),
		...(input.sourceAnchorId !== undefined ? { sourceAnchorId: input.sourceAnchorId } : {}),
		...(input.provenanceId !== undefined ? { provenanceId: input.provenanceId } : {}),
		createdAt: context.timestamp,
		updatedAt: context.timestamp
	};
	const status = input.status ?? 'open';
	const todo: Todo =
		status === 'done'
			? { ...fields, status, completedAt: context.timestamp }
			: { ...fields, status };
	return { kind: 'create', todo };
}

export interface TodoCreationRules {
	create(
		input: CreateTodoInput,
		context: { readonly id: TodoId; readonly userId: Todo['userId']; readonly timestamp: DateTime }
	): { kind: 'invalid'; message: string } | { kind: 'create'; todo: Todo };
}
export interface TodoEditingRules {
	edit(todo: Todo, input: Omit<UpdateTodoInput, 'todoId'>, timestamp: DateTime): Todo;
	hasEdits(input: UpdateTodoInput): boolean;
}
export class TodoEditingRulesService implements TodoCreationRules, TodoEditingRules {
	create(
		input: CreateTodoInput,
		context: { readonly id: TodoId; readonly userId: Todo['userId']; readonly timestamp: DateTime }
	): { kind: 'invalid'; message: string } | { kind: 'create'; todo: Todo } {
		return decideTodoCreation(input, context);
	}
	edit(todo: Todo, input: Omit<UpdateTodoInput, 'todoId'>, timestamp: DateTime): Todo {
		return applyTodoEdit(todo, input, timestamp);
	}
	hasEdits(input: UpdateTodoInput): boolean {
		return hasTodoEdits(input);
	}
}
