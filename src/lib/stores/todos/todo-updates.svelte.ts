import { SvelteSet } from 'svelte/reactivity';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId, TodoStatus, UpdateTodoInput } from '$lib/models/todos';

import type { WorkspaceDraft } from '$lib/stores/workspace/resources.svelte';
import { workspaceSession } from '$lib/stores/workspace/session.svelte';
import { rightPanel } from '../shell/right-panel.svelte';

class TodoUpdatesStore {
	creating = $state(false);
	pendingIds = new SvelteSet<TodoId>();
	lastError = $state<string | null>(null);
	isPending(todoId: TodoId): boolean {
		return this.pendingIds.has(todoId);
	}
	editor(todoId: TodoId): WorkspaceDraft<'todos'> {
		const session = workspaceSession.current;
		if (!session) throw new Error('Open the workspace before editing a todo');
		return session.resources.draft({ type: 'todos', id: [todoId] });
	}
	async save(
		editor: WorkspaceDraft<'todos'>,
		patch: Omit<UpdateTodoInput, 'todoId'>
	): Promise<boolean> {
		const todo = editor.value;
		if (!todo) {
			this.lastError = editor.lastError ?? 'Open the todo before editing';
			return false;
		}
		this.pendingIds.add(todo.id);
		try {
			const result = await editor.stage({ kind: 'updateTodo', todoId: todo.id, ...patch });
			this.lastError = result.kind === 'failure' ? result.message : null;
			return result.kind === 'saved';
		} finally {
			this.pendingIds.delete(todo.id);
		}
	}
	async updateTodo(todoId: TodoId, patch: Omit<UpdateTodoInput, 'todoId'>): Promise<boolean> {
		const editor = this.editor(todoId);
		await editor.read();
		return this.save(editor, patch);
	}
	setStatus(todoId: TodoId, status: TodoStatus): Promise<boolean> {
		return this.updateTodo(todoId, { status });
	}
	async remove(todoId: TodoId): Promise<boolean> {
		const editor = this.editor(todoId);
		await editor.read();
		const result = await editor.stage({ kind: 'deleteTodo', todoId });
		this.lastError = result.kind === 'failure' ? result.message : null;
		if (result.kind === 'saved' && rightPanel.todoId === todoId) rightPanel.close();
		return result.kind === 'saved';
	}
	async create(
		title: string,
		projectId?: ProjectId,
		status: TodoStatus = 'open'
	): Promise<boolean> {
		this.creating = true;
		this.lastError = null;
		try {
			const session = await workspaceSession.start();
			const target =
				projectId ?? session.shell.projects.find((project) => project.role === 'inbox')?.id;
			if (!target) throw new Error('The inbox is not available on this device');
			const id = crypto.randomUUID() as TodoId;
			await session.resources.create({
				kind: 'createTodo',
				id,
				projectId: target,
				title,
				status,
				responsibility: 'mine'
			});
			return true;
			// audit-allow: silent-catch — the creation form retains its input on false and displays lastError.
		} catch (error) {
			this.lastError =
				error instanceof Error ? error.message : 'Could not save the todo on this device';
			return false;
		} finally {
			this.creating = false;
		}
	}
}
export const todoUpdates = new TodoUpdatesStore();
