<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import type { TodoId, TodoStatus, TodoView } from '$lib/models/todos';
	import {
		dragHandleZone,
		SHADOW_ITEM_MARKER_PROPERTY_NAME,
		TRIGGERS,
		type DndEvent
	} from 'svelte-dnd-action';
	import { Button } from '$lib/components/ui/button';
	import { FtPlus as Plus, FtCheck as Check } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todos/todo-updates.svelte';
	import TodoCard from './todo-card.svelte';
	import { todoStatusEmptyCopy, todoStatusLabels, todoStatusStyle } from '../shared/labels';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { Input } from '$lib/components/ui/input';
	import { SvelteSet } from 'svelte/reactivity';

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
	let settlingId = $state<TodoId | null>(null);

	function isShadowItem(item: BoardItem): boolean {
		return Boolean(
			(item as BoardItem & { [SHADOW_ITEM_MARKER_PROPERTY_NAME]?: boolean })[
				SHADOW_ITEM_MARKER_PROPERTY_NAME
			]
		);
	}

	/* The dnd zone only ever receives the visible (collapsed-to-5) slice of a
	   column, since svelte-dnd-action requires its `items` option to match what's
	   rendered. Reattach the hidden tail here so a drag doesn't drop those todos
	   from state. */
	function withHiddenTail(status: TodoStatus, updatedVisible: BoardItem[]): BoardItem[] {
		if (expanded.has(status)) return updatedVisible;
		const visibleIds = new Set(updatedVisible.map((item) => item.id));
		const hidden = board[status]
			.slice(VISIBLE_LIMIT)
			.filter((item) => !isShadowItem(item) && !visibleIds.has(item.id));
		return [...updatedVisible, ...hidden];
	}

	/* A collapsed zone normally renders five cards. During a tail drop the dnd
	   library adds a sixth shadow item; keep that transient item rendered so the
	   zone cannot lose the drop just because the column is collapsed. The same
	   rule keeps the settled card visible until refreshed server data arrives. */
	function visibleItems(items: BoardItem[], isExpanded: boolean): BoardItem[] {
		if (isExpanded) return items;
		const visible = items.slice(0, VISIBLE_LIMIT);
		const transient = items.find(
			(item) => isShadowItem(item) || item.id === draggingId || item.id === settlingId
		);
		return transient && !visible.includes(transient) ? [...visible, transient] : visible;
	}

	function handleConsider(status: TodoStatus, event: CustomEvent<DndEvent<BoardItem>>): void {
		draggingId = event.detail.info.id as TodoId;
		override = { ...board, [status]: withHiddenTail(status, event.detail.items) };
	}

	function handleFinalize(status: TodoStatus, event: CustomEvent<DndEvent<BoardItem>>): void {
		const movedId = event.detail.info.id as TodoId;
		const isTargetDrop = event.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE;
		const moved = todos.find((item) => item.todo.id === movedId);
		const updatedItems =
			isTargetDrop && moved && !event.detail.items.some((item) => item.id === movedId)
				? [...event.detail.items, { id: movedId, view: moved }]
				: event.detail.items;
		override = { ...board, [status]: withHiddenTail(status, updatedItems) };
		draggingId = null;
		settlingId = isTargetDrop ? movedId : settlingId;
		settleEndsAt = Date.now() + 300;
		if (isTargetDrop && moved && moved.todo.status !== status) {
			onmove?.(movedId, status);
		}
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			override = null;
			settlingId = null;
		}, 5000);
	}

	let lastTodos = untrack(() => todos);
	$effect(() => {
		if (todos === lastTodos) return;
		lastTodos = todos;
		if (!override) return;
		clearTimeout(settleTimer);
		settleTimer = setTimeout(
			() => {
				override = null;
				settlingId = null;
			},
			Math.max(0, settleEndsAt - Date.now())
		);
	});

	let addingTo = $state<TodoStatus | null>(page.url.searchParams.has('quickTodo') ? 'open' : null);
	let newTitle = $state('');

	const VISIBLE_LIMIT = 5;
	const expanded = new SvelteSet<TodoStatus>();

	function toggleExpanded(status: TodoStatus): void {
		if (expanded.has(status)) expanded.delete(status);
		else expanded.add(status);
	}

	async function addTodo(status: TodoStatus): Promise<void> {
		const title = newTitle.trim();
		if (!title) return;
		const ok = await todoUpdates.create(title, projectId, status);
		if (ok) {
			newTitle = '';
			addingTo = null;
		} else toast.error(todoUpdates.lastError ?? 'Could not add the todo. Try again.');
	}
</script>

<div
	class="flex min-h-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto pb-3 2xl:grid 2xl:grid-cols-4 2xl:grid-rows-1 2xl:overflow-visible 2xl:pb-0"
>
	{#each columns as status (status)}
		{@const items = board[status]}
		{@const isExpanded = expanded.has(status)}
		{@const visible = visibleItems(items, isExpanded)}
		<!-- Tinted tray holding default cards — the same layering recipe as the
		     docked right panel (bg-sidebar + ring hairline). -->
		<section
			class="flex min-h-40 w-80 shrink-0 snap-start flex-col gap-1 overflow-hidden rounded-xl bg-sidebar p-2 ring-inset ring-1 ring-foreground/10 2xl:w-auto 2xl:min-w-0"
		>
			<h3 class="eyebrow flex items-center gap-1.5 px-1.5 pt-1 pb-2">
				{#if status === 'done'}
					<Check class="size-3 text-success" />
				{:else}
					<span class={['size-1.5 shrink-0 rounded-full', todoStatusStyle[status].dotClass]}></span>
				{/if}
				{todoStatusLabels[status]}
				<span
					class={[
						'font-semibold tabular-nums',
						status === 'done' ? 'text-success' : 'text-black dark:text-white'
					]}>{items.length}</span
				>
			</h3>
			<div class="relative flex min-h-0 flex-1 flex-col">
				{#if items.length === 0 && addingTo !== status}
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
						{@attach (node: HTMLElement) => node.focus()}
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
				     stay put, which is what lets the board fill the page height. The p-0.5
				     keeps the cards' ring hairline (and the dnd drop outline) from being
				     clipped by the overflow scrollport. -->
				<div
					data-todo-status={status}
					class="flex min-h-20 flex-1 flex-col gap-2 overflow-y-auto p-0.5"
					use:dragHandleZone={{
						items: visible,
						flipDurationMs: 150,
						type: 'todo',
						/* The default drop-target outline is library yellow. */
						dropTargetStyle: { outline: '2px solid var(--color-brand)' }
					}}
					onconsider={(event) => handleConsider(status, event)}
					onfinalize={(event) => handleFinalize(status, event)}
				>
					{#each visible as item (item.id)}
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
				{#if items.length > VISIBLE_LIMIT}
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
						onclick={() => toggleExpanded(status)}
					>
						{#if isExpanded}
							Show less
						{:else}
							Show <span class="font-semibold text-black tabular-nums dark:text-white"
								>{items.length - VISIBLE_LIMIT}</span
							> more
						{/if}
					</Button>
				{/if}
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
