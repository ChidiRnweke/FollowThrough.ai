<script lang="ts">
	import type { ProjectId, TodoId, TodoStatus, TodoView } from '$lib/models';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import { Button } from '$lib/components/ui/button';
	import { FtPlus as Plus, FtCheck as Check, FtClose as Close } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import TodoCard from './todo-card.svelte';
	import { todoStatusEmptyCopy, todoStatusLabels, todoStatusStyle } from './labels';
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
		onopen
	}: {
		todos: readonly TodoView[];
		columns?: readonly TodoStatus[];
		projectId?: ProjectId;
		projectNames?: ReadonlyMap<ProjectId, string>;
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

<div
	class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 xl:grid xl:grid-cols-4 xl:overflow-visible xl:pb-0"
>
	{#each columns as status (status)}
		<section
			class="flex min-h-40 w-80 shrink-0 snap-start flex-col gap-2 overflow-hidden rounded-lg border border-border bg-muted/30 xl:w-auto xl:min-w-0"
		>
			<div class={['h-0.5 w-full', todoStatusStyle[status].accentClass]}></div>
			<h3 class="eyebrow flex items-center justify-between px-3 pt-1">
				<span class="flex items-center gap-1.5">
					{todoStatusLabels[status]}
					<span
						class="inline-flex min-w-4 items-center justify-center rounded-full bg-background px-1 text-xs font-normal tabular-nums"
					>
						{board[status].length}
					</span>
				</span>
			</h3>
			<div class="relative flex min-h-20 flex-1 flex-col">
				{#if board[status].length === 0}
					<p
						class="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground/70"
					>
						{todoStatusEmptyCopy[status]}
					</p>
				{/if}
				<div
					class="flex min-h-20 flex-1 flex-col gap-2 px-2"
					use:dragHandleZone={{ items: board[status], flipDurationMs: 150, type: 'todo' }}
					onconsider={(event) => handleConsider(status, event)}
					onfinalize={(event) => handleFinalize(status, event)}
				>
					{#each board[status] as item (item.id)}
						<TodoCard
							view={item.view}
							compact
							draggable
							projectName={projectNames?.get(item.view.todo.projectId)}
							{onopen}
							onstatus={onmove}
						/>
					{/each}
				</div>
			</div>
			<!-- Height is reserved even where there is no Add action, so Done does not
			     sit shorter than its peers and leave the board bottom ragged. -->
			<div class="min-h-10 px-2 pb-2">
				{#if addingTo === status}
					<div class="flex items-stretch">
						<Input
							id={status === 'open' ? 'quick-todo-input' : undefined}
							autofocus
							placeholder="Todo title…"
							bind:value={newTitle}
							class="min-w-0 flex-1 rounded-r-none border-r-0"
							onkeydown={(e) => {
								if (e.key === 'Escape') addingTo = null;
								if (e.key === 'Enter') void addTodo(status);
							}}
						/>
						<Button
							variant="outline"
							size="icon"
							class="rounded-none border-r-0"
							aria-label="Add todo"
							onclick={() => void addTodo(status)}
						>
							<Check />
						</Button>
						<Button
							variant="outline"
							size="icon"
							class="rounded-l-none"
							aria-label="Cancel"
							onclick={() => (addingTo = null)}
						>
							<Close />
						</Button>
					</div>
				{:else if status !== 'done'}
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start text-muted-foreground hover:text-foreground"
						aria-label="Add todo to {todoStatusLabels[status]}"
						onclick={() => {
							addingTo = status;
							newTitle = '';
						}}
					>
						<Plus class="size-3.5" />
						Add
					</Button>
				{/if}
			</div>
		</section>
	{/each}
</div>
