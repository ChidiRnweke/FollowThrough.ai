import type { DateTime } from '$lib/models/workspace';
import type { Todo, TodoId, TodoListFilter } from '$lib/models/todos';

export interface TodoRepository {
	findForUpdate(id: TodoId): Promise<Todo | undefined>;
	findById(id: TodoId): Promise<Todo | undefined>;
	list(filter: TodoListFilter): Promise<readonly Todo[]>;
	/**
	 * Count matching todos without assembling views. The agent context bar runs on
	 * every navigation, so it must not pay for the full list-and-assemble path.
	 */
	count(filter: TodoListFilter): Promise<number>;
	/** Distinct non-empty categories across the actor's live todos, for filter menus. */
	listCategories(): Promise<readonly string[]>;
	insert(todo: Todo): Promise<Todo>;
	update(todo: Todo): Promise<Todo>;
	softDelete(id: TodoId, deletedAt: DateTime): Promise<void>;
}
