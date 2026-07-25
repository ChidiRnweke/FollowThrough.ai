<script lang="ts">
	import type { NoteSummary, Project, ProjectId, TodoId, TodoView } from '$lib/models';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { openTodoSurface } from '$lib/navigation/responsive-surfaces';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import KanbanBoard from '../kanban-board.svelte';
	import TodoTable from '../todo-table.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { Input } from '$lib/components/ui/input';
	import { FtPlus as Plus, FtTodos as ListTodo } from '$lib/components/icons';
	import EmptyState from '../empty-state.svelte';
	import AgentAction from '../agent/agent-action.svelte';
	import { agentActions } from '../agent/agent-actions';

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
     so they read as belonging to the board rather than floating between the two. -->
<div class="flex flex-col gap-4">
	<div
		class="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:flex-wrap sm:items-center"
	>
		<Tabs.Root value={view} onValueChange={(value) => setParam('view', value)}>
			<Tabs.List>
				<Tabs.Trigger value="board">Board</Tabs.Trigger>
				<Tabs.Trigger value="list">List</Tabs.Trigger>
			</Tabs.List>
		</Tabs.Root>
		<div class="flex flex-wrap items-center gap-2">
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
			<!-- Same segmented species as the view switcher; position, not styling,
			     is what distinguishes filtering from switching surface. -->
			<ToggleGroup.Root
				type="single"
				value={responsibility}
				onValueChange={(value) =>
					setParam('responsibility', value === '' || value === 'all' ? undefined : value)}
				aria-label="Filter by responsibility"
			>
				<ToggleGroup.Item value="all">All</ToggleGroup.Item>
				<ToggleGroup.Item value="mine">Mine</ToggleGroup.Item>
				<ToggleGroup.Item value="waiting_on">Waiting on</ToggleGroup.Item>
			</ToggleGroup.Root>
			<!-- Last in the row and the only thing in it that is not a filter: reading
			     the controls left to right ends on what to do about what they show. -->
			<AgentAction
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
			<TodoTable {todos} {notes} projectNames={projects ? projectNames : undefined} onopen={open} />
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
						class="text-muted-foreground hover:text-foreground"
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
			{todos}
			{projectId}
			projectNames={projects ? projectNames : undefined}
			onopen={open}
			onmove={(id, status) => void move(id, status)}
		/>
	{/if}
</div>
