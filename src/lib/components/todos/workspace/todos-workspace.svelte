<script lang="ts">
	import type { NoteSummary } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';
	import type { TodoId, TodoView } from '$lib/models/todos';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { openTodoSurface } from '$lib/client/shell/responsive-surfaces';
	import { todoUpdates } from '$lib/stores/todos/todo-updates.svelte';
	import KanbanBoard from '../kanban-board.svelte';
	import TodoTable from '../todo-table.svelte';
	import TodoExport from '../todo-export.svelte';
	import { filterTodosByTitle } from '../todo-filter';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { Input } from '$lib/components/ui/input';
	import { FtPlus as Plus, FtSearch as Search, FtTodos as ListTodo } from '$lib/components/icons';
	import EmptyState from '../../shared/empty-state.svelte';
	import AgentAction from '../../agent/agent-action.svelte';
	import { agentActions } from '../../agent/agent-actions';

	let {
		todos,
		view,
		basePath = '/todos',
		projectId,
		projects,
		notes = [],
		categories = []
	}: {
		todos: readonly TodoView[];
		view: string;
		basePath?: string;
		projectId?: ProjectId;
		projects?: readonly Project[];
		notes?: readonly NoteSummary[];
		categories?: readonly string[];
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
		if (match) openTodoSurface(match, `${page.url.pathname}${page.url.search}`);
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

	const responsibility = $derived(page.url.searchParams.get('responsibility') ?? 'all');
	const categoryFilter = $derived(page.url.searchParams.get('category') ?? '');

	/* Title search is a lens over what is already loaded, so it stays local
	   state instead of a URL param — the server-side params keep doing the
	   shareable filtering. */
	let query = $state('');
	const visibleTodos = $derived(filterTodosByTitle(todos, query));

	let addingListTodo = $state(false);
	let listTitle = $state('');

	async function addListTodo(): Promise<void> {
		const title = listTitle.trim();
		if (!title) return;
		listTitle = '';
		addingListTodo = false;
		const ok = await todoUpdates.create(title, projectId, 'open');
		if (!ok) toast.error('Could not add the todo. Try again.');
	}
</script>

<!-- The controls sit closer to the surface they act on than to the page header,
     so they read as belonging to the board rather than floating between the two.
     Filters lead on the left; the view switcher and the page's one agent action
     close the row on the right. -->
<div class="flex min-h-0 flex-1 flex-col gap-4">
	<div
		class="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:flex-wrap sm:items-center"
	>
		<div class="flex flex-wrap items-center gap-2">
			<div class="relative">
				<Search
					class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					placeholder="Filter todos…"
					aria-label="Filter todos by title"
					bind:value={query}
					class="h-11 w-full pl-8 sm:h-8 sm:w-44"
				/>
			</div>
			{#if projects && projects.length > 0}
				<Select.Root
					type="single"
					value={projectFilter}
					onValueChange={(value) => setParam('projectId', value === '' ? undefined : value)}
				>
					<Select.Trigger
						class="h-11 w-full sm:h-8 sm:w-44"
						size="sm"
						aria-label="Filter by project"
					>
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
			<!-- Responsibility is a pair of radio pills, not tabs: neither active
			     means All, and clicking the active pill clears back to it. -->
			<ToggleGroup.Root
				type="single"
				value={responsibility === 'all' ? '' : responsibility}
				onValueChange={(value) => setParam('responsibility', value === '' ? undefined : value)}
				aria-label="Filter by responsibility"
			>
				<ToggleGroup.Item value="mine">Mine</ToggleGroup.Item>
				<ToggleGroup.Item value="waiting_on">Waiting on</ToggleGroup.Item>
			</ToggleGroup.Root>
			{#if categories.length > 0}
				<Select.Root
					type="single"
					value={categoryFilter}
					onValueChange={(value) => setParam('category', value === '' ? undefined : value)}
				>
					<Select.Trigger
						class="h-11 w-full sm:h-8 sm:w-44"
						size="sm"
						aria-label="Filter by category"
					>
						{categoryFilter === '' ? 'All categories' : categoryFilter}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="">All categories</Select.Item>
						{#each categories as category (category)}
							<Select.Item value={category}>{category}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			{/if}
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<Tabs.Root value={view} onValueChange={(value) => setParam('view', value)}>
				<Tabs.List>
					<Tabs.Trigger value="board">Board</Tabs.Trigger>
					<Tabs.Trigger value="list">List</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
			<TodoExport
				todos={visibleTodos}
				{projectId}
				projectNames={projects ? projectNames : undefined}
			/>
			<AgentAction
				variant="outline"
				action={agentActions.todosFromNotes}
				context={projectId ? { projectId } : undefined}
			/>
		</div>
	</div>

	{#if view === 'list'}
		{#if todos.length === 0}
			<EmptyState
				icon={ListTodo}
				title="No todos yet."
				hint="Capture a promise from a note, or add one from the board."
				class="py-16"
			>
				{#snippet action()}
					<div class="flex w-full max-w-xs flex-col items-stretch gap-2">
						<Button variant="outline" size="sm" onclick={() => setParam('view', 'board')}>
							Add a todo on the board
						</Button>
						<!-- The notes almost certainly already hold the todos this screen is
						     missing, which is the one thing an empty board cannot say itself. -->
						<AgentAction
							variant="row"
							action={agentActions.todosFromNotes}
							context={projectId ? { projectId } : undefined}
						/>
					</div>
				{/snippet}
			</EmptyState>
		{:else}
			<TodoTable
				todos={visibleTodos}
				{notes}
				{categories}
				projectNames={projects ? projectNames : undefined}
				onopen={open}
			/>
			<div class="mt-1">
				{#if addingListTodo}
					<div class="flex items-center gap-1">
						<Input
							autofocus
							placeholder="Todo title…"
							bind:value={listTitle}
							onkeydown={(e) => {
								if (e.key === 'Escape') addingListTodo = false;
								if (e.key === 'Enter') void addListTodo();
							}}
						/>
						<Button size="sm" onclick={() => void addListTodo()}>Add</Button>
						<Button size="sm" variant="ghost" onclick={() => (addingListTodo = false)}
							>Cancel</Button
						>
					</div>
				{:else}
					<Button
						variant="ghost"
						size="sm"
						class="w-full justify-start text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
						onclick={() => {
							addingListTodo = true;
							listTitle = '';
						}}
					>
						<Plus class="size-3.5" />
						Add todo
					</Button>
				{/if}
			</div>
		{/if}
	{:else}
		<KanbanBoard
			todos={visibleTodos}
			{projectId}
			projectNames={projects ? projectNames : undefined}
			onopen={open}
			onmove={(id, status) => void move(id, status)}
		/>
	{/if}
</div>
