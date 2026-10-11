import { workspaceSession, workspaceViews } from '$lib/factories/workspace/session';
import type { WorkspaceDraftController } from '$lib/controllers/workspace/workspace';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId, TodoStatus, UpdateTodoInput } from '$lib/models/todos';
import { todoUpdateState as state } from '$lib/stores/todos/todo-updates.svelte';
import { rightPanel } from '$lib/stores/shell/right-panel.svelte';

/** Todo edits from lists, boards and fields; every edit is stored on this device first. */
export const todoUpdates = {
	get creating(): boolean {
		return state.creating;
	},
	get lastError(): string | null {
		return state.lastError;
	},
	isPending(todoId: TodoId): boolean {
		return state.pendingIds.has(todoId);
	},
	/** An editor whose base is the todo as a field shows it. */
	editor(todoId: TodoId): WorkspaceDraftController<'todos'> {
		const session = workspaceSession.current;
		if (!session) throw new Error('Open the workspace before editing a todo');
		return session.resources.draft({ type: 'todos', id: [todoId] });
	},
	async save(
		editor: WorkspaceDraftController<'todos'>,
		patch: Omit<UpdateTodoInput, 'todoId'>
	): Promise<boolean> {
		const todo = editor.value;
		if (!todo) {
			state.report(editor.lastError ?? 'Open the todo before editing');
			return false;
		}
		state.begin(todo.id);
		const result = await editor.stage({ kind: 'updateTodo', todoId: todo.id, ...patch });
		state.finish(todo.id);
		state.report(result.kind === 'failure' ? result.message : null);
		return result.kind === 'saved';
	},
	async updateTodo(todoId: TodoId, patch: Omit<UpdateTodoInput, 'todoId'>): Promise<boolean> {
		state.begin(todoId);
		const result = await workspaceSession.edit(
			{ type: 'todos', id: [todoId] },
			{ kind: 'updateTodo', todoId, ...patch }
		);
		state.finish(todoId);
		state.report(result.kind === 'failure' ? result.message : null);
		return result.kind === 'saved';
	},
	setStatus(todoId: TodoId, status: TodoStatus): Promise<boolean> {
		return todoUpdates.updateTodo(todoId, { status });
	},
	async remove(todoId: TodoId): Promise<boolean> {
		const result = await workspaceSession.edit(
			{ type: 'todos', id: [todoId] },
			{ kind: 'deleteTodo', todoId }
		);
		state.report(result.kind === 'failure' ? result.message : null);
		if (result.kind === 'saved' && rightPanel.todoId === todoId) rightPanel.close();
		return result.kind === 'saved';
	},
	/** A todo lands in the given project, or in the inbox when none is given. */
	async create(
		title: string,
		projectId?: ProjectId,
		status: TodoStatus = 'open'
	): Promise<boolean> {
		state.setCreating(true);
		state.report(null);
		const unopened = await workspaceSession.start().then(
			() => null,
			(error: unknown) => (error instanceof Error ? error.message : 'The workspace could not open')
		);
		const target =
			unopened === null
				? (projectId ??
					workspaceViews.currentShell.projects.find((project) => project.role === 'inbox')?.id)
				: undefined;
		const result = target
			? await workspaceSession.create({
					kind: 'createTodo',
					id: crypto.randomUUID() as TodoId,
					projectId: target,
					title,
					status,
					responsibility: 'mine'
				})
			: ({
					kind: 'failure',
					message: unopened ?? 'The inbox is not available on this device'
				} as const);
		state.setCreating(false);
		state.report(result.kind === 'failure' ? result.message : null);
		return result.kind === 'saved';
	}
};
