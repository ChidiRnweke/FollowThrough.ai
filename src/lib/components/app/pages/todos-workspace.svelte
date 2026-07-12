<script lang="ts">
	import type { TodoId, TodoView } from '$lib/models';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import KanbanBoard from '../kanban-board.svelte';
	import TodoTable from '../todo-table.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let { todos, view }: { todos: readonly TodoView[]; view: string } = $props();

	function open(todoId: TodoId): void {
		const match = todos.find((item) => item.todo.id === todoId);
		if (match) rightPanel.openTodo(match);
	}

	async function move(todoId: TodoId, status: Parameters<typeof todoUpdates.setStatus>[1]) {
		const ok = await todoUpdates.setStatus(todoId, status);
		if (!ok) toast.error('Could not move the todo. Try again.');
	}

	function setParam(key: string, value?: string): void {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		if (value === undefined) params.delete(key);
		else params.set(key, value);
		void goto(`/todos?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	const responsibility = $derived(page.url.searchParams.get('responsibility'));
</script>

<div class="flex flex-wrap items-center justify-between gap-2">
	<Tabs.Root value={view} onValueChange={(value) => setParam('view', value)}>
		<Tabs.List>
			<Tabs.Trigger value="board">Board</Tabs.Trigger>
			<Tabs.Trigger value="list">List</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>
	<div class="flex items-center gap-1">
		<Button
			variant={responsibility === null ? 'secondary' : 'ghost'}
			size="sm"
			onclick={() => setParam('responsibility')}
		>
			All
		</Button>
		<Button
			variant={responsibility === 'mine' ? 'secondary' : 'ghost'}
			size="sm"
			onclick={() => setParam('responsibility', 'mine')}
		>
			Mine
		</Button>
		<Button
			variant={responsibility === 'waiting_on' ? 'secondary' : 'ghost'}
			size="sm"
			onclick={() => setParam('responsibility', 'waiting_on')}
		>
			Waiting on
		</Button>
	</div>
</div>

{#if view === 'list'}
	<TodoTable {todos} onopen={open} />
{:else}
	<KanbanBoard {todos} onopen={open} onmove={(id, status) => void move(id, status)} />
{/if}
