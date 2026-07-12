<script lang="ts">
	import type { TodoId, TodoStatus, TodoView } from '$lib/models';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import TodoCard from './todo-card.svelte';
	import { todoStatusLabels } from './labels';

	interface BoardItem {
		id: TodoId;
		view: TodoView;
	}

	let {
		todos,
		columns = ['backlog', 'open', 'in_progress', 'done'],
		onmove,
		onopen
	}: {
		todos: readonly TodoView[];
		columns?: readonly TodoStatus[];
		onmove?: (todoId: TodoId, status: TodoStatus) => void;
		onopen?: (todoId: TodoId) => void;
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
</script>

<div class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
	{#each columns as status (status)}
		<section class="flex min-h-48 flex-col gap-2 rounded-lg border border-border bg-muted/30 p-2">
			<h3
				class="flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground"
			>
				{todoStatusLabels[status]}
				<span>{board[status].length}</span>
			</h3>
			<div
				class="flex min-h-32 flex-1 flex-col gap-2"
				use:dndzone={{ items: board[status], flipDurationMs: 150, type: 'todo' }}
				onconsider={(event) => handleConsider(status, event)}
				onfinalize={(event) => handleFinalize(status, event)}
			>
				{#each board[status] as item (item.id)}
					<TodoCard view={item.view} compact {onopen} />
				{/each}
			</div>
		</section>
	{/each}
</div>
