import type { ActorContext } from '$lib/models/identity';
import type { CreateTodoInput, Todo, TodoId, TodoListFilter, TodoContext } from '$lib/models/todos';
import type { SourceAnchor } from '$lib/models/provenance';
export interface TodoCreator {
	create(actor: ActorContext, todo: Todo): Promise<Todo>;
}
export interface TodoReader {
	get(actor: ActorContext, todoId: TodoId): Promise<Todo>;
}
export interface TodoEditor {
	getForEdit(actor: ActorContext, todoId: TodoId): Promise<Todo>;
	update(actor: ActorContext, todo: Todo): Promise<Todo>;
}
export interface TodoDeleter {
	softDelete(actor: ActorContext, todoId: TodoId): Promise<void>;
}
export interface DueTodoFinder {
	findDue(actor: ActorContext, through: string): Promise<readonly Todo[]>;
}
export interface WaitingOnFinder {
	findWaitingOn(actor: ActorContext): Promise<readonly Todo[]>;
}
export interface TodoSourceFinder {
	findSource(actor: ActorContext, todoId: TodoId): Promise<SourceAnchor>;
}
export interface TodoLister {
	list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]>;
	count(actor: ActorContext, filter: TodoListFilter): Promise<number>;
	listCategories(actor: ActorContext): Promise<readonly string[]>;
}
export interface TodoContextReader {
	readContext(actor: ActorContext, todo: Todo): Promise<TodoContext>;
	readContexts(actor: ActorContext, todos: readonly Todo[]): Promise<readonly TodoContext[]>;
}
