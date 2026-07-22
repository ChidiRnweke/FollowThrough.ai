<script lang="ts">
	import type { NoteSummary, ProjectId, TodoId, TodoView } from '$lib/models';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import TodoStatusField from './todo-fields/todo-status-field.svelte';
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

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head class="text-xs font-medium tracking-wide uppercase">Todo</Table.Head>
			{#if projectNames}
				<Table.Head class="text-xs font-medium tracking-wide uppercase">Project</Table.Head>
			{/if}
			<Table.Head class="text-xs font-medium tracking-wide uppercase">Status</Table.Head>
			<Table.Head class="text-xs font-medium tracking-wide uppercase">Due</Table.Head>
			<Table.Head class="text-xs font-medium tracking-wide uppercase">Responsibility</Table.Head>
			<Table.Head class="text-xs font-medium tracking-wide uppercase">Source</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each todos as view (view.todo.id)}
			{@const done = view.todo.status === 'done' || view.todo.status === 'cancelled'}
			<Table.Row>
				<Table.Cell class="font-medium">
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
						<span class={done ? 'text-muted-foreground line-through' : ''}>{view.todo.title}</span>
					{/if}
				</Table.Cell>
				{#if projectNames}
					<Table.Cell class="text-muted-foreground">
						{projectNames.get(view.todo.projectId) ?? '—'}
					</Table.Cell>
				{/if}
				<Table.Cell><TodoStatusField todoId={view.todo.id} value={view.todo.status} /></Table.Cell>
				<Table.Cell><TodoDueDateField todoId={view.todo.id} value={view.todo.dueDate} /></Table.Cell
				>
				<Table.Cell
					><TodoResponsibilityField
						todoId={view.todo.id}
						value={view.todo.responsibility}
					/></Table.Cell
				>
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
