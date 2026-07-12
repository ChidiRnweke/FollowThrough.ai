import type { ActorContext, Todo, TodoId, TodoResponsibility, TodoStatus } from '../models';
export interface TodoRepository {
	findById(actor: ActorContext, id: TodoId): Promise<Todo | undefined>;
	list(
		actor: ActorContext,
		filter: {
			statuses?: readonly TodoStatus[];
			responsibility?: TodoResponsibility;
		}
	): Promise<readonly Todo[]>;
	insert(actor: ActorContext, todo: Todo): Promise<Todo>;
	update(actor: ActorContext, todo: Todo): Promise<Todo>;
}
