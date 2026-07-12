<script lang="ts">
	import type { TodoId, TodoView } from '$lib/models';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { formatDate, todoStatusLabels } from './labels';

	let {
		todos,
		onopen
	}: {
		todos: readonly TodoView[];
		onopen?: (todoId: TodoId) => void;
	} = $props();
</script>

<Table.Root>
	<Table.Header>
		<Table.Row>
			<Table.Head>Todo</Table.Head>
			<Table.Head>Status</Table.Head>
			<Table.Head>Due</Table.Head>
			<Table.Head>Responsibility</Table.Head>
			<Table.Head>Source</Table.Head>
		</Table.Row>
	</Table.Header>
	<Table.Body>
		{#each todos as view (view.todo.id)}
			<Table.Row>
				<Table.Cell class="font-medium">
					{#if onopen}
						<Button
							variant="link"
							class="h-auto p-0 font-medium text-foreground"
							onclick={() => onopen(view.todo.id)}
						>
							{view.todo.title}
						</Button>
					{:else}
						{view.todo.title}
					{/if}
				</Table.Cell>
				<Table.Cell>
					<Badge variant="ghost" class="text-muted-foreground">
						{todoStatusLabels[view.todo.status]}
					</Badge>
				</Table.Cell>
				<Table.Cell class="text-muted-foreground">
					{view.todo.dueDate ? formatDate(view.todo.dueDate) : '—'}
				</Table.Cell>
				<Table.Cell class="text-muted-foreground">
					{view.todo.responsibility === 'waiting_on'
						? `Waiting on ${view.todo.waitingOn ?? 'someone'}`
						: 'Mine'}
				</Table.Cell>
				<Table.Cell>
					{#if view.sourceNote}
						<a class="text-sm text-primary hover:underline" href="/notes/{view.sourceNote.id}">
							{view.sourceNote.title}
						</a>
					{:else}
						<span class="text-muted-foreground">—</span>
					{/if}
				</Table.Cell>
			</Table.Row>
		{/each}
	</Table.Body>
</Table.Root>
