<script lang="ts">
	import type { TodoId, TodoStatus } from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { formatDate, provenanceCaption, todoStatusLabels } from '../labels';

	let {
		onstatus
	}: {
		onstatus?: (todoId: TodoId, status: TodoStatus) => void;
	} = $props();

	const view = $derived(rightPanel.todoView);
	const statuses: TodoStatus[] = ['backlog', 'open', 'in_progress', 'done', 'cancelled'];
</script>

{#if view}
	<div class="flex flex-col gap-3">
		<h3 class="text-sm font-semibold {view.todo.status === 'done' ? 'line-through' : ''}">
			{view.todo.title}
		</h3>
		{#if view.todo.description}
			<p class="text-sm text-muted-foreground">{view.todo.description}</p>
		{/if}
		<div class="flex flex-wrap items-center gap-1.5">
			{#if onstatus}
				<Select.Root
					type="single"
					value={view.todo.status}
					onValueChange={(status) => onstatus(view.todo.id, status as TodoStatus)}
				>
					<Select.Trigger size="sm" aria-label="Todo status">
						{todoStatusLabels[view.todo.status]}
					</Select.Trigger>
					<Select.Content>
						{#each statuses as status (status)}
							<Select.Item value={status} label={todoStatusLabels[status]} />
						{/each}
					</Select.Content>
				</Select.Root>
			{:else}
				<Badge variant="ghost" class="text-muted-foreground">
					{todoStatusLabels[view.todo.status]}
				</Badge>
			{/if}
			{#if view.todo.dueDate}
				<Badge variant="ghost" class="text-muted-foreground">
					Due {formatDate(view.todo.dueDate)}
				</Badge>
			{/if}
			{#if view.todo.responsibility === 'waiting_on'}
				<Badge variant="ghost" class="bg-warning/15 text-warning-foreground dark:text-warning">
					Waiting on {view.todo.waitingOn ?? 'someone'}
				</Badge>
			{/if}
		</div>
		{#if view.anchor}
			<blockquote class="border-l-2 border-border pl-2 text-sm text-muted-foreground">
				{view.anchor.quote}
			</blockquote>
		{/if}
		{#if view.provenance}
			<p class="provenance-caption">
				{provenanceCaption(view.provenance, view.sourceNote?.title)}
			</p>
		{/if}
		{#if view.sourceNote}
			<a class="text-sm text-primary hover:underline" href="/notes/{view.sourceNote.id}">
				Jump to source
			</a>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">Pick a todo to see its details.</p>
{/if}
