<script lang="ts">
	import type { NoteSummary, ProjectId, TodoId, TodoView } from '$lib/models';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { FtChevronDown, FtChevronUp, FtChevronsUd } from '$lib/components/icons';
	import TodoStatusField from './todo-fields/todo-status-field.svelte';
	import TodoPriorityField from './todo-fields/todo-priority-field.svelte';
	import TodoCategoryField from './todo-fields/todo-category-field.svelte';
	import TodoDueDateField from './todo-fields/todo-due-date-field.svelte';
	import TodoResponsibilityField from './todo-fields/todo-responsibility-field.svelte';
	import TodoSourceField from './todo-fields/todo-source-field.svelte';
	import { sortTodoViews, type TodoSortDir, type TodoSortKey } from './todo-sort';

	let {
		todos,
		projectNames,
		onopen,
		notes = [],
		categories = []
	}: {
		todos: readonly TodoView[];
		projectNames?: ReadonlyMap<ProjectId, string>;
		onopen?: (todoId: TodoId) => void;
		notes?: readonly NoteSummary[];
		categories?: readonly string[];
	} = $props();

	// Null = keep the server's order (dueDate asc, updatedAt desc). Clicking a header
	// cycles asc → desc → cleared.
	let sortKey = $state<TodoSortKey | null>(null);
	let sortDir = $state<TodoSortDir>('asc');

	const sortedTodos = $derived(sortTodoViews(todos, sortKey, sortDir, projectNames));

	function toggleSort(key: TodoSortKey): void {
		if (sortKey !== key) {
			sortKey = key;
			sortDir = 'asc';
		} else if (sortDir === 'asc') {
			sortDir = 'desc';
		} else {
			sortKey = null;
		}
	}
</script>

{#snippet sortHead(key: TodoSortKey, label: string)}
	<Table.Head
		class="eyebrow"
		aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
	>
		<Button variant="ghost" size="xs" class="eyebrow -ml-2.5 gap-1" onclick={() => toggleSort(key)}>
			{label}
			{#if sortKey === key}
				{#if sortDir === 'asc'}
					<FtChevronUp class="size-3" />
				{:else}
					<FtChevronDown class="size-3" />
				{/if}
			{:else}
				<FtChevronsUd class="size-3 opacity-40" />
			{/if}
		</Button>
	</Table.Head>
{/snippet}

<div class="flex flex-col gap-3 md:hidden">
	{#each sortedTodos as view (view.todo.id)}
		<section class="flex flex-col gap-3 rounded-lg border border-border p-4">
			<Button
				variant="link"
				class="h-auto min-h-11 justify-start whitespace-normal p-0 text-left font-medium text-foreground line-clamp-2"
				onclick={() => onopen?.(view.todo.id)}
			>
				{view.todo.title}
			</Button>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<div class="flex flex-col gap-1">
					<span class="eyebrow">Status</span><TodoStatusField
						todoId={view.todo.id}
						value={view.todo.status}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<span class="eyebrow">Priority</span><TodoPriorityField
						todoId={view.todo.id}
						value={view.todo.priority}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<span class="eyebrow">Category</span><TodoCategoryField
						todoId={view.todo.id}
						value={view.todo.category}
						{categories}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<span class="eyebrow">Due</span><TodoDueDateField
						todoId={view.todo.id}
						value={view.todo.dueDate}
					/>
				</div>
				<div class="flex flex-col gap-1">
					<span class="eyebrow">Responsibility</span><TodoResponsibilityField
						todoId={view.todo.id}
						value={view.todo.responsibility}
					/>
				</div>
			</div>
			<div class="flex flex-col gap-1">
				<span class="eyebrow">Source</span>
				<TodoSourceField
					todoId={view.todo.id}
					projectId={view.todo.projectId}
					value={view.todo.linkedNoteId}
					sourceTitle={view.sourceNote?.title}
					hasOrigin={view.originNote !== undefined}
					{notes}
				/>
			</div>
		</section>
	{/each}
</div>

<!-- No forced minimum wider than the canvas: the previous `min-w-5xl` inside a
     `max-w-5xl` shell guaranteed a scrollbar no matter how much room was free. -->
<div class="relative hidden max-w-full overflow-x-auto md:block" data-todo-table-scroll>
	<Table.Root class="min-w-2xl">
		<Table.Header class="sticky top-0 z-10 bg-background dark:bg-card">
			<Table.Row>
				{@render sortHead('title', 'Todo')}
				{#if projectNames}
					{@render sortHead('project', 'Project')}
				{/if}
				{@render sortHead('status', 'Status')}
				{@render sortHead('priority', 'Priority')}
				{@render sortHead('category', 'Category')}
				{@render sortHead('due', 'Due')}
				{@render sortHead('responsibility', 'Responsibility')}
				{@render sortHead('source', 'Source')}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each sortedTodos as view (view.todo.id)}
				{@const done = view.todo.status === 'done' || view.todo.status === 'cancelled'}
				<Table.Row>
					<Table.Cell class="sticky left-0 z-10 bg-background font-medium dark:bg-card">
						{#if onopen}
							<Button
								variant="link"
								class={[
									'h-auto p-0 font-medium text-foreground',
									done && 'text-muted-foreground line-through'
								]}
								onclick={() => onopen(view.todo.id)}
							>
								{view.todo.title}
							</Button>
						{:else}
							<span class={done ? 'text-muted-foreground line-through' : ''}>{view.todo.title}</span
							>
						{/if}
					</Table.Cell>
					{#if projectNames}
						<Table.Cell class="text-muted-foreground">
							{projectNames.get(view.todo.projectId) ?? '—'}
						</Table.Cell>
					{/if}
					<!-- Metadata cells stay quiet so the title column keeps priority; the
					     controls surface on hover rather than every row humming at once. -->
					<Table.Cell
						><TodoStatusField todoId={view.todo.id} value={view.todo.status} quiet /></Table.Cell
					>
					<Table.Cell
						><TodoPriorityField
							todoId={view.todo.id}
							value={view.todo.priority}
							quiet
						/></Table.Cell
					>
					<Table.Cell
						><TodoCategoryField
							todoId={view.todo.id}
							value={view.todo.category}
							{categories}
							quiet
						/></Table.Cell
					>
					<Table.Cell
						><TodoDueDateField todoId={view.todo.id} value={view.todo.dueDate} quiet /></Table.Cell
					>
					<Table.Cell>
						<TodoResponsibilityField todoId={view.todo.id} value={view.todo.responsibility} quiet />
						{#if view.todo.responsibility === 'waiting_on' && view.todo.waitingOn}
							<p class="provenance-caption mt-1">{view.todo.waitingOn}</p>
						{/if}
					</Table.Cell>
					<Table.Cell
						><TodoSourceField
							todoId={view.todo.id}
							projectId={view.todo.projectId}
							value={view.todo.linkedNoteId}
							sourceTitle={view.sourceNote?.title}
							hasOrigin={view.originNote !== undefined}
							quiet
							{notes}
						/></Table.Cell
					>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
