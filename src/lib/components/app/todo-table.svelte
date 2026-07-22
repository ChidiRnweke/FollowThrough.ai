<script lang="ts">
	import type { NoteSummary, ProjectId, TodoId, TodoView } from '$lib/models';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
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
</script>

<div class="flex flex-col gap-3 md:hidden">
	{#each todos as view (view.todo.id)}
		<section class="flex flex-col gap-3 rounded-lg border border-border p-4">
			<Button
				variant="link"
				class="h-auto min-h-11 justify-start whitespace-normal p-0 text-left font-medium text-foreground"
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

<div class="relative hidden max-w-full overflow-x-auto md:block">
	<Table.Root class="min-w-5xl">
		<Table.Header class="sticky top-0 z-10 bg-background">
			<Table.Row>
				<Table.Head class="eyebrow">Todo</Table.Head>
				{#if projectNames}
					<Table.Head class="eyebrow">Project</Table.Head>
				{/if}
				<Table.Head class="eyebrow">Status</Table.Head>
				<Table.Head class="eyebrow">Priority</Table.Head>
				<Table.Head class="eyebrow">Due</Table.Head>
				<Table.Head class="eyebrow">Responsibility</Table.Head>
				<Table.Head class="eyebrow">Source</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each todos as view (view.todo.id)}
				{@const done = view.todo.status === 'done' || view.todo.status === 'cancelled'}
				<Table.Row>
					<Table.Cell class="sticky left-0 z-10 bg-background font-medium">
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
					<Table.Cell><TodoStatusField todoId={view.todo.id} value={view.todo.status} /></Table.Cell
					>
					<Table.Cell
						><TodoPriorityField todoId={view.todo.id} value={view.todo.priority} /></Table.Cell
					>
					<Table.Cell
						><TodoDueDateField todoId={view.todo.id} value={view.todo.dueDate} /></Table.Cell
					>
					<Table.Cell>
						<TodoResponsibilityField todoId={view.todo.id} value={view.todo.responsibility} />
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
							{notes}
						/></Table.Cell
					>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
