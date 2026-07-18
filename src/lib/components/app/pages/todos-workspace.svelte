<script lang="ts">
	import type { NoteSummary, Project, ProjectId, TodoId, TodoView } from '$lib/models';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import KanbanBoard from '../kanban-board.svelte';
	import TodoTable from '../todo-table.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';

	let {
		todos,
		view,
		basePath = '/todos',
		projectId,
		projects,
		notes = []
	}: {
		todos: readonly TodoView[];
		view: string;
		basePath?: string;
		projectId?: ProjectId;
		projects?: readonly Project[];
		notes?: readonly NoteSummary[];
	} = $props();

	const projectNames = $derived(
		new Map((projects ?? []).map((project) => [project.id, project.name]))
	);
	const projectFilter = $derived(page.url.searchParams.get('projectId') ?? '');
	const projectFilterLabel = $derived(
		projectFilter === ''
			? 'All projects'
			: (projectNames.get(projectFilter as ProjectId) ?? 'All projects')
	);

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
		void goto(`${basePath}?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	const responsibility = $derived(page.url.searchParams.get('responsibility'));
	const detail = $derived(
		page.url.searchParams.get('detail') === 'detailed' ? 'detailed' : 'basic'
	);
</script>

<div class="flex flex-wrap items-center justify-between gap-2">
	<Tabs.Root value={view} onValueChange={(value) => setParam('view', value)}>
		<Tabs.List>
			<Tabs.Trigger value="board">Board</Tabs.Trigger>
			<Tabs.Trigger value="list">List</Tabs.Trigger>
		</Tabs.List>
	</Tabs.Root>
	{#if view === 'board'}
		<ToggleGroup.Root
			type="single"
			value={detail}
			onValueChange={(value) => setParam('detail', value === 'detailed' ? 'detailed' : undefined)}
			aria-label="Board detail"
		>
			<ToggleGroup.Item value="basic">Basic</ToggleGroup.Item>
			<ToggleGroup.Item value="detailed">Detailed</ToggleGroup.Item>
		</ToggleGroup.Root>
	{/if}
	<div class="flex items-center gap-1">
		{#if projects && projects.length > 0}
			<Select.Root
				type="single"
				value={projectFilter}
				onValueChange={(value) => setParam('projectId', value === '' ? undefined : value)}
			>
				<Select.Trigger class="h-8 w-44" size="sm" aria-label="Filter by project">
					{projectFilterLabel}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="">All projects</Select.Item>
					{#each projects as project (project.id)}
						<Select.Item value={project.id}>{project.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}
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
	{#if todos.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 py-16 text-center">
			<p class="text-sm text-muted-foreground">
				No todos yet. Capture a promise from a note or add one from the board.
			</p>
			<Button variant="outline" size="sm" onclick={() => setParam('view', 'board')}>
				Add a todo on the board
			</Button>
		</div>
	{:else}
		<TodoTable {todos} {notes} projectNames={projects ? projectNames : undefined} onopen={open} />
	{/if}
{:else}
	<KanbanBoard
		{todos}
		{projectId}
		projectNames={projects ? projectNames : undefined}
		{notes}
		{detail}
		onopen={open}
		onmove={(id, status) => void move(id, status)}
	/>
{/if}
