import type { ActorContext, Todo, TodoId, TodoListFilter } from '../models';

export interface TodoRepository {
	findById(actor: ActorContext, id: TodoId): Promise<Todo | undefined>;
	list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]>;
	insert(actor: ActorContext, todo: Todo): Promise<Todo>;
	update(actor: ActorContext, todo: Todo): Promise<Todo>;
	softDelete(actor: ActorContext, id: TodoId, deletedAt: Todo['deletedAt']): Promise<void>;
}
