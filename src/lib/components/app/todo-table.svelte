<script lang="ts">
	import type { NoteSummary, ProjectId, TodoId, TodoView } from '$lib/models';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { FtChevronDown, FtChevronUp, FtChevronsUd } from '$lib/components/icons';
	import TodoStatusField from './todo-fields/todo-status-field.svelte';
	import TodoPriorityField from './todo-fields/todo-priority-field.svelte';
	import TodoDueDateField from './todo-fields/todo-due-date-field.svelte';
	import TodoResponsibilityField from './todo-fields/todo-responsibility-field.svelte';
	import TodoSourceField from './todo-fields/todo-source-field.svelte';

	let {
		todos,
		projectNames,
		onopen,
		notes = []
	}: {
		todos: readonly TodoView[];
		projectNames?: ReadonlyMap<ProjectId, string>;
		onopen?: (todoId: TodoId) => void;
		notes?: readonly NoteSummary[];
	} = $props();

	type SortKey = 'title' | 'project' | 'status' | 'priority' | 'due' | 'responsibility' | 'source';

	// Null = keep the server's order (dueDate asc, updatedAt desc). Clicking a header
	// cycles asc → desc → cleared.
	let sortKey = $state<SortKey | null>(null);
	let sortDir = $state<'asc' | 'desc'>('asc');

	// Workflow order, matching todoStatusLabels; urgency-first for priority.
	const statusOrder = ['backlog', 'open', 'in_progress', 'done', 'cancelled'] as const;
	const priorityOrder = ['high', 'medium', 'low'] as const;
	const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

	function sortValue(view: TodoView, key: SortKey): string | number | null {
		switch (key) {
			case 'title':
				return view.todo.title;
			case 'project':
				return projectNames?.get(view.todo.projectId) ?? null;
			case 'status':
				return statusOrder.indexOf(view.todo.status);
			case 'priority':
				return view.todo.priority ? priorityOrder.indexOf(view.todo.priority) : null;
			case 'due':
				return view.todo.dueDate ?? null;
			case 'responsibility':
				return view.todo.responsibility;
			case 'source':
				return view.sourceNote?.title ?? null;
		}
	}

	const sortedTodos = $derived.by(() => {
		if (!sortKey) return todos;
		const key = sortKey;
		const dir = sortDir === 'asc' ? 1 : -1;
		return todos.toSorted((a, b) => {
			const va = sortValue(a, key);
			const vb = sortValue(b, key);
			// Nulls always sort last, whichever direction.
			if (va === null && vb === null) return 0;
			if (va === null) return 1;
			if (vb === null) return -1;
			const cmp =
				typeof va === 'number' && typeof vb === 'number'
					? va - vb
					: collator.compare(String(va), String(vb));
			return cmp * dir;
		});
	});

	function toggleSort(key: SortKey): void {
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

{#snippet sortHead(key: SortKey, label: string)}
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
