import type { ActorContext, Todo, TodoId, TodoListFilter } from '$lib/models';

export interface TodoRepository {
	findById(actor: ActorContext, id: TodoId): Promise<Todo | undefined>;
	list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]>;
	/**
	 * Count matching todos without assembling views. The agent context bar runs on
	 * every navigation, so it must not pay for the full list-and-assemble path.
	 */
	count(actor: ActorContext, filter: TodoListFilter): Promise<number>;
	/** Distinct non-empty categories across the actor's live todos, for filter menus. */
	listCategories(actor: ActorContext): Promise<readonly string[]>;
	insert(actor: ActorContext, todo: Todo): Promise<Todo>;
	update(actor: ActorContext, todo: Todo): Promise<Todo>;
	softDelete(actor: ActorContext, id: TodoId, deletedAt: Todo['deletedAt']): Promise<void>;
}
