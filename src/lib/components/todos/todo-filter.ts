import type { TodoView } from '$lib/models/todos';

/**
 * Case-insensitive substring filter over todo titles. Extracted from the
 * workspace so the lens logic is unit-testable without a browser or a server.
 */
export const filterTodosByTitle = (
	todos: readonly TodoView[],
	query: string
): readonly TodoView[] => {
	const needle = query.trim().toLowerCase();
	if (needle === '') return todos;
	return todos.filter((item) => item.todo.title.toLowerCase().includes(needle));
};
