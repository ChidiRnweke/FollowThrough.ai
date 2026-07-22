<script lang="ts">
	import type { LocalDate, NoteSummary, TodoId, TodoStatus, TodoView } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ProvenanceDot from './provenance-dot.svelte';
	import { formatDate, todayLocalDate, todoPriorityLabels, todoPriorityStyle } from './labels';
	import TodoDueDateField from './todo-fields/todo-due-date-field.svelte';
	import TodoTextField from './todo-fields/todo-text-field.svelte';
	import TodoPriorityField from './todo-fields/todo-priority-field.svelte';
	import TodoResponsibilityField from './todo-fields/todo-responsibility-field.svelte';
	import TodoSourceField from './todo-fields/todo-source-field.svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { dragHandle } from 'svelte-dnd-action';

	let {
		view,
		compact = false,
		today = todayLocalDate(),
		projectName,
		onstatus,
		onopen,
		detail = 'basic',
		notes = [],
		draggable = false
	}: {
		view: TodoView;
		compact?: boolean;
		today?: LocalDate;
		projectName?: string;
		onstatus?: (todoId: TodoId, status: TodoStatus) => void;
		onopen?: (todoId: TodoId) => void;
		detail?: 'basic' | 'detailed';
		notes?: readonly NoteSummary[];
		draggable?: boolean;
	} = $props();

	const done = $derived(view.todo.status === 'done');
	const overdue = $derived(!done && view.todo.dueDate !== undefined && view.todo.dueDate < today);
	const waiting = $derived(view.todo.responsibility === 'waiting_on');
	const createdAge = $derived(relativeAge(view.todo.createdAt));
	function relativeAge(value: string): string {
		const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
		if (days === 0) return 'today';
		if (days === 1) return 'yesterday';
		return `${days} days ago`;
	}
	function openBody(event: MouseEvent): void {
		if (
			(event.target as HTMLElement).closest('button, a, input, [role="button"], [role="combobox"]')
		)
			return;
		onopen?.(view.todo.id);
	}
</script>

<Card.Root
	data-compact={compact || undefined}
	class="gap-1.5 py-3 [&_a]:cursor-pointer [&_button]:cursor-pointer"
	onclick={openBody}
>
	<Card.Header class="px-4">
		<Card.Title class="flex items-start gap-2 text-sm font-medium">
			{#if draggable}
				<!-- svelte-dnd-action intentionally uses a non-passive listener here: touch dragging
				     calls preventDefault(), so making it passive would break the drag handle. -->
				<span
					use:dragHandle
					class="-ml-2 inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Drag {view.todo.title}"
					title="Drag todo"
				>
					<GripVertical />
				</span>
			{/if}
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
		{#if detail === 'detailed'}
			<TodoDueDateField todoId={view.todo.id} value={view.todo.dueDate} />
			<TodoPriorityField todoId={view.todo.id} value={view.todo.priority} />
		{:else if view.todo.dueDate}
			<Badge
				variant="ghost"
				class={overdue ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground'}
				>{formatDate(view.todo.dueDate)}</Badge
			>
		{/if}
		{#if detail === 'detailed'}
			<TodoResponsibilityField todoId={view.todo.id} value={view.todo.responsibility} />
			{#if waiting}
				<span class="max-w-40" title="Waiting on">
					{#key `${view.todo.id}-waiting-${view.todo.updatedAt}`}<TodoTextField
							todoId={view.todo.id}
							value={view.todo.waitingOn}
							field="waitingOn"
							label="Waiting on"
						/>{/key}
				</span>
			{/if}
			<TodoSourceField
				todoId={view.todo.id}
				projectId={view.todo.projectId}
				value={view.todo.linkedNoteId}
				sourceTitle={view.sourceNote?.title}
				hasOrigin={view.originNote !== undefined}
				{notes}
			/>
			<span class="text-xs text-muted-foreground">Created {createdAge}</span>
		{:else if waiting}
			<Badge variant="ghost" class="bg-warning/15 text-warning-foreground dark:text-warning"
				>Waiting on {view.todo.waitingOn ?? 'someone'}</Badge
			>
		{/if}
		{#if detail === 'basic' && view.todo.priority && view.todo.priority !== 'low'}
			<Badge variant="ghost" class={todoPriorityStyle[view.todo.priority].badgeClass}
				>{todoPriorityLabels[view.todo.priority]}</Badge
			>
		{/if}
	</Card.Content>
</Card.Root>
