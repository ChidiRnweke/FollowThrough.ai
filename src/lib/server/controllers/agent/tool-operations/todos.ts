import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { TodosController } from '$lib/server/controllers/todos/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentToolOutput } from '../tool-outputs';
interface TodosToolOperationsDependencies {
	todos(): Pick<TodosController, 'list' | 'create' | 'createBatch' | 'update'>;
}
export interface TodosToolOperations {
	list_todos(input: AgentToolInput<'list_todos'>): Promise<AgentToolOutput<'list_todos'>>;
	create_todo(input: AgentToolInput<'create_todo'>): Promise<AgentToolOutput<'create_todo'>>;
	create_todos(input: AgentToolInput<'create_todos'>): Promise<AgentToolOutput<'create_todos'>>;
	update_todo(input: AgentToolInput<'update_todo'>): Promise<AgentToolOutput<'update_todo'>>;
}
export class TodosToolOperationsController implements TodosToolOperations {
	constructor(
		private readonly controllers: TodosToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly toolPresentation: AgentToolPresentation
	) {}
	async list_todos(input: AgentToolInput<'list_todos'>): Promise<AgentToolOutput<'list_todos'>> {
		return {
			todos: (await this.controllers.todos().list(this.actor, input)).todos.map((view) =>
				this.toolPresentation.projectTodo(view.todo)
			)
		};
	}
	async create_todo(input: AgentToolInput<'create_todo'>): Promise<AgentToolOutput<'create_todo'>> {
		return this.toolPresentation.projectTodoWrite(
			(await this.controllers.todos().create(this.actor, input)).todo
		);
	}
	async create_todos(
		input: AgentToolInput<'create_todos'>
	): Promise<AgentToolOutput<'create_todos'>> {
		return {
			todos: (await this.controllers.todos().createBatch(this.actor, input)).todos.map((value) =>
				this.toolPresentation.projectTodoWrite(value)
			)
		};
	}
	async update_todo(input: AgentToolInput<'update_todo'>): Promise<AgentToolOutput<'update_todo'>> {
		return this.toolPresentation.projectTodoWrite(
			(await this.controllers.todos().update(this.actor, input)).todo
		);
	}
}
