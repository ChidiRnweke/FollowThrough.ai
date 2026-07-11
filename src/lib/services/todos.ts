import type {
	ActorContext,
	CreateTodoInput,
	SourceAnchor,
	Todo,
	TodoId,
	TodoStatus
} from '../models';
export interface TodoCreator {
	create(actor: ActorContext, input: CreateTodoInput): Promise<Todo>;
}
export interface TodoReader {
	get(actor: ActorContext, todoId: TodoId): Promise<Todo>;
}
export interface TodoEditor {
	update(actor: ActorContext, todo: Todo): Promise<Todo>;
}
export interface TodoStatusChanger {
	change(actor: ActorContext, todoId: TodoId, status: TodoStatus): Promise<Todo>;
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
