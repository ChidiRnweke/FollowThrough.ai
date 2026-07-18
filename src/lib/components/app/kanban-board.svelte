<script lang="ts">
	import type { NoteSummary, ProjectId, TodoId, TodoStatus, TodoView } from '$lib/models';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import TodoCard from './todo-card.svelte';
	import { todoStatusLabels } from './labels';
	import { page } from '$app/state';
	import { Input } from '$lib/components/ui/input';

	interface BoardItem {
		id: TodoId;
		view: TodoView;
	}

	let {
		todos,
		columns = ['backlog', 'open', 'in_progress', 'done'],
		projectId,
		projectNames,
		onmove,
		onopen,
		detail = 'basic',
		notes = []
	}: {
		todos: readonly TodoView[];
		columns?: readonly TodoStatus[];
		projectId?: ProjectId;
		projectNames?: ReadonlyMap<ProjectId, string>;
		onmove?: (todoId: TodoId, status: TodoStatus) => void;
		onopen?: (todoId: TodoId) => void;
		detail?: 'basic' | 'detailed';
		notes?: readonly NoteSummary[];
	} = $props();

	let board = $derived.by(() => {
		const grouped: Record<TodoStatus, BoardItem[]> = {
			backlog: [],
			open: [],
			in_progress: [],
			done: [],
			cancelled: []
		};
		for (const view of todos) {
			grouped[view.todo.status].push({ id: view.todo.id, view });
		}
		return grouped;
	});

	function handleConsider(status: TodoStatus, event: CustomEvent<DndEvent<BoardItem>>): void {
		board = { ...board, [status]: event.detail.items };
	}

	function handleFinalize(status: TodoStatus, event: CustomEvent<DndEvent<BoardItem>>): void {
		board = { ...board, [status]: event.detail.items };
		const moved = event.detail.items.find((item) => item.id === event.detail.info.id);
		if (moved && moved.view.todo.status !== status) {
			onmove?.(moved.id, status);
		}
	}

	let addingTo = $state<TodoStatus | null>(page.url.searchParams.has('quickTodo') ? 'open' : null);
	let newTitle = $state('');

	async function addTodo(status: TodoStatus): Promise<void> {
		const title = newTitle.trim();
		if (!title) return;
		newTitle = '';
		addingTo = null;
		const ok = await todoUpdates.create(title, projectId, status);
		if (!ok) toast.error('Could not add the todo. Try again.');
	}
</script>

<div class="grid gap-3 grid-cols-2 md:grid-cols-4">
	{#each columns as status (status)}
		<section class="flex min-h-48 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2">
			<h3
				class="flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground"
			>
				{todoStatusLabels[status]}
				<span class="flex items-center gap-1">
					<span>{board[status].length}</span>
					{#if status !== 'done'}
						<Button
							variant="ghost"
							size="icon-sm"
							class="size-5"
							aria-label="Add todo to {todoStatusLabels[status]}"
							onclick={() => {
								addingTo = status;
								newTitle = '';
							}}
						>
							<Plus class="size-3.5" />
						</Button>
					{/if}
				</span>
			</h3>
			{#if addingTo === status}
				<div class="flex flex-col gap-1">
					<Input
						id={status === 'open' ? 'quick-todo-input' : undefined}
						autofocus={status === 'open' && page.url.searchParams.has('quickTodo')}
						placeholder="Todo title…"
						bind:value={newTitle}
						onkeydown={(e) => {
							if (e.key === 'Escape') addingTo = null;
							if (e.key === 'Enter') void addTodo(status);
						}}
					/>
					<div class="flex gap-1">
						<Button type="submit" size="sm" variant="default" class="flex-1">Add</Button>
						<Button size="sm" variant="ghost" onclick={() => (addingTo = null)}>Cancel</Button>
					</div>
				</div>
			{/if}
			<div
				class="flex min-h-32 flex-1 flex-col gap-2"
				use:dndzone={{ items: board[status], flipDurationMs: 150, type: 'todo' }}
				onconsider={(event) => handleConsider(status, event)}
				onfinalize={(event) => handleFinalize(status, event)}
			>
				{#each board[status] as item (item.id)}
					<TodoCard
						view={item.view}
						compact
						projectName={projectNames?.get(item.view.todo.projectId)}
						{detail}
						{notes}
						{onopen}
						onstatus={onmove}
					/>
				{/each}
			</div>
		</section>
	{/each}
</div>
