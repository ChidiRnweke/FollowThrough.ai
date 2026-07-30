<script lang="ts">
	import type { ProjectId, TodoId, TodoStatus, TodoView } from '$lib/models';
	import { dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import { Button } from '$lib/components/ui/button';
	import { FtPlus as Plus, FtCheck as Check } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import TodoCard from './todo-card.svelte';
	import { todoStatusEmptyCopy, todoStatusLabels, todoStatusStyle } from './labels';
	import { untrack } from 'svelte';
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

	const grouped = $derived.by(() => {
		const buckets: Record<TodoStatus, BoardItem[]> = {
			backlog: [],
			open: [],
			in_progress: [],
			done: [],
			cancelled: []
		};
		for (const view of todos) {
			buckets[view.todo.status].push({ id: view.todo.id, view });
		}
		return buckets;
	});

	/* Optimistic drop: the override keeps the card where it was dropped until
	   fresh server data lands, so the card never snaps back to its old column.
	   Two guards around that:
	   - adopting new data inside the drag-settle window makes Svelte detach the
	     dragged node mid-animation, and the library's recovery re-appends it
	     hidden (the "vanishing card") — so new data is adopted only after the
	     settle ends;
	   - if no data ever arrives (the move failed), a fallback timer reverts to
	     server truth rather than parking the card where it was dropped. */
	let override = $state<Record<TodoStatus, BoardItem[]> | null>(null);
	const board = $derived(override ?? grouped);
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let settleEndsAt = 0;
	let draggingId = $state<TodoId | null>(null);

	function handleConsider(status: TodoStatus, event: CustomEvent<DndEvent<BoardItem>>): void {
		draggingId = event.detail.info.id as TodoId;
		override = { ...board, [status]: event.detail.items };
	}

	function handleFinalize(status: TodoStatus, event: CustomEvent<DndEvent<BoardItem>>): void {
		override = { ...board, [status]: event.detail.items };
		draggingId = null;
		settleEndsAt = Date.now() + 300;
		const moved = event.detail.items.find((item) => item.id === event.detail.info.id);
		if (moved && moved.view.todo.status !== status) {
			onmove?.(moved.id, status);
		}
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => (override = null), 5000);
	}

	let lastTodos = untrack(() => todos);
	$effect(() => {
		if (todos === lastTodos) return;
		lastTodos = todos;
		if (!override) return;
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => (override = null), Math.max(0, settleEndsAt - Date.now()));
	});

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
	class="flex min-h-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto pb-3 xl:grid xl:grid-cols-4 xl:grid-rows-1 xl:overflow-visible xl:pb-0"
>
	{#each columns as status (status)}
		<!-- Tinted tray holding default cards — the same layering recipe as the
		     docked right panel (bg-sidebar + ring hairline). -->
		<section
			class="flex min-h-40 w-80 shrink-0 snap-start flex-col gap-1 overflow-hidden rounded-xl bg-sidebar p-2 ring-1 ring-foreground/10 xl:w-auto xl:min-w-0"
		>
			<h3 class="eyebrow flex items-center gap-1.5 px-1.5 pt-1 pb-2">
				{#if status === 'done'}
					<Check class="size-3 text-success" />
				{:else}
					<span class={['size-1.5 shrink-0 rounded-full', todoStatusStyle[status].dotClass]}></span>
				{/if}
				{todoStatusLabels[status]}
				<span class="font-normal tabular-nums">{board[status].length}</span>
			</h3>
			<div class="relative flex min-h-0 flex-1 flex-col">
				{#if board[status].length === 0 && addingTo !== status}
					<p
						class="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-muted-foreground/70"
					>
						{todoStatusEmptyCopy[status]}
					</p>
				{/if}
				{#if addingTo === status}
					<Input
						id={status === 'open' ? 'quick-todo-input' : undefined}
						autofocus
						placeholder="Todo title…"
						bind:value={newTitle}
						class="mb-2"
						onkeydown={(e) => {
							if (e.key === 'Escape') addingTo = null;
							if (e.key === 'Enter') void addTodo(status);
						}}
					/>
				{/if}
				<!-- A long column scrolls inside the tray; the header and the add row
				     stay put, which is what lets the board fill the page height. -->
				<div
					class="flex min-h-20 flex-1 flex-col gap-2 overflow-y-auto"
					use:dragHandleZone={{
						items: board[status],
						flipDurationMs: 150,
						type: 'todo',
						/* The default drop-target outline is library yellow. */
						dropTargetStyle: { outline: '2px solid var(--color-brand)' }
					}}
					onconsider={(event) => handleConsider(status, event)}
					onfinalize={(event) => handleFinalize(status, event)}
				>
					{#each board[status] as item (item.id)}
						<TodoCard
							view={item.view}
							compact
							draggable
							lifted={item.id === draggingId}
							projectName={projectNames?.get(item.view.todo.projectId)}
							{onopen}
							onstatus={onmove}
						/>
					{/each}
				</div>
			</div>
			{#if status !== 'done'}
				<Button
					variant="ghost"
					size="sm"
					class="w-full justify-start text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
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
		</section>
	{/each}
</div>
