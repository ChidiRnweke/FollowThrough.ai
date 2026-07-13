<script lang="ts">
	import type { LocalDate, TodoId, TodoStatus, TodoView } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ProvenanceDot from './provenance-dot.svelte';
	import { formatDate, todayLocalDate } from './labels';

	let {
		view,
		compact = false,
		today = todayLocalDate(),
		projectName,
		onstatus,
		onopen
	}: {
		view: TodoView;
		compact?: boolean;
		today?: LocalDate;
		projectName?: string;
		onstatus?: (todoId: TodoId, status: TodoStatus) => void;
		onopen?: (todoId: TodoId) => void;
	} = $props();

	const done = $derived(view.todo.status === 'done');
	const overdue = $derived(!done && view.todo.dueDate !== undefined && view.todo.dueDate < today);
	const waiting = $derived(view.todo.responsibility === 'waiting_on');
</script>

<Card.Root data-compact={compact || undefined} class="gap-1.5 py-3">
	<Card.Header class="px-4">
		<Card.Title class="flex items-start gap-2 text-sm font-medium">
			<Checkbox
				checked={done}
				aria-label={done ? 'Reopen todo' : 'Complete todo'}
				onCheckedChange={(checked) => onstatus?.(view.todo.id, checked ? 'done' : 'open')}
			/>
			{#if onopen}
				<Button
					variant="link"
					class="h-auto justify-start whitespace-normal p-0 text-left font-medium text-foreground {done
						? 'text-muted-foreground line-through'
						: ''}"
					onclick={() => onopen(view.todo.id)}
				>
					{view.todo.title}
				</Button>
			{:else}
				<span class={done ? 'text-muted-foreground line-through' : ''}>{view.todo.title}</span>
			{/if}
		</Card.Title>
		{#if view.provenance}
			<Card.Action>
				<ProvenanceDot
					provenance={view.provenance}
					anchor={view.anchor}
					sourceTitle={view.sourceNote?.title}
					href={view.sourceNote ? `/notes/${view.sourceNote.id}` : undefined}
				/>
			</Card.Action>
		{/if}
	</Card.Header>
	<Card.Content class="flex flex-wrap items-center gap-1.5 px-4">
		{#if projectName}
			<Badge variant="outline" class="text-muted-foreground">{projectName}</Badge>
		{/if}
		{#if view.todo.dueDate}
			<Badge
				variant="ghost"
				class={overdue ? 'bg-warning/15 text-warning' : 'text-muted-foreground'}
			>
				{formatDate(view.todo.dueDate)}
			</Badge>
		{/if}
		{#if waiting}
			<Badge variant="ghost" class="bg-warning/15 text-warning-foreground dark:text-warning">
				Waiting on {view.todo.waitingOn ?? 'someone'}
			</Badge>
		{/if}
	</Card.Content>
</Card.Root>
