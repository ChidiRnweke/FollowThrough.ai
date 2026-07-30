<script lang="ts">
	import type { LocalDate, TodoId, TodoStatus, TodoView } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ProvenanceDot from './provenance-dot.svelte';
	import { formatDate, todayLocalDate, todoPriorityLabels, todoPriorityStyle } from './labels';
	import { FtGrip as GripVertical } from '$lib/components/icons';
	import { dragHandle } from 'svelte-dnd-action';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { FtEllipsis as MoreHorizontal } from '$lib/components/icons';
	import { todoStatusLabels } from './labels';

	const statuses: readonly TodoStatus[] = ['backlog', 'open', 'in_progress', 'done'];

	let {
		view,
		compact = false,
		today = todayLocalDate(),
		projectName,
		onstatus,
		onopen,
		draggable = false
	}: {
		view: TodoView;
		compact?: boolean;
		today?: LocalDate;
		projectName?: string;
		onstatus?: (todoId: TodoId, status: TodoStatus) => void;
		onopen?: (todoId: TodoId) => void;
		draggable?: boolean;
	} = $props();

	const done = $derived(view.todo.status === 'done');
	const overdue = $derived(!done && view.todo.dueDate !== undefined && view.todo.dueDate < today);
	const waiting = $derived(view.todo.responsibility === 'waiting_on');
	const showPriority = $derived(view.todo.priority !== undefined && view.todo.priority !== 'low');
	/* Only set values earn a badge — an empty field says nothing worth the space. */
	const hasBadges = $derived(
		projectName !== undefined || view.todo.dueDate !== undefined || showPriority
	);
	/* The footer carries provenance and who the todo waits on — the card's
	   glanceable metadata row. Rendered only when one of them is set. */
	const hasFooter = $derived(view.provenance !== undefined || waiting);
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
	class="group/card gap-2 rounded-lg py-3.5"
	onclick={openBody}
>
	<Card.Header class="px-4">
		<Card.Title class="flex min-w-0 items-start gap-2 text-sm font-medium">
			{#if draggable}
				<!-- svelte-dnd-action intentionally uses a non-passive listener here: touch dragging
				     calls preventDefault(), so making it passive would break the drag handle. -->
				<Tip text="Drag todo">
					{#snippet children({ props })}
						<!-- Reveals on hover/focus. Opacity rather than display so the card
						     never reflows and the handle stays keyboard-reachable. -->
						<span
							{...props}
							use:dragHandle
							class="-ml-2 inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity outline-none group-hover/card:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
							aria-label="Drag {view.todo.title}"
						>
							<GripVertical />
						</span>
					{/snippet}
				</Tip>
			{/if}
			<Checkbox
				checked={done}
				aria-label={done ? 'Reopen todo' : 'Complete todo'}
				onCheckedChange={(checked) => onstatus?.(view.todo.id, checked ? 'done' : 'open')}
			/>
			{#if onopen}
				<!-- Full wrap, no clamp: a clipped title reads as lost text. A bare
				     button, not a shadcn Button — the base `inline-flex`/`whitespace-nowrap`
				     would fight the wrap. Focus shows as an underline, not a ring: Chrome
				     applies :focus-visible to clicked buttons, and a ring leaves a box
				     parked around the title of whichever todo is open. -->
				<button
					type="button"
					class={[
						'tactile min-w-0 flex-1 rounded-sm text-left text-sm leading-snug font-medium break-words underline-offset-2 outline-none focus-visible:underline',
						done ? 'text-muted-foreground line-through' : 'text-foreground'
					]}
					onclick={() => onopen(view.todo.id)}
				>
					{view.todo.title}
				</button>
			{:else}
				<span
					class={[
						'min-w-0 flex-1 leading-snug break-words',
						done && 'text-muted-foreground line-through'
					]}>{view.todo.title}</span
				>
			{/if}
		</Card.Title>
		{#if onstatus}
			<Card.Action>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-11 sm:size-8"
								aria-label="Move todo"
							>
								<MoreHorizontal />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Group>
							<DropdownMenu.Label>Move to…</DropdownMenu.Label>
							{#each statuses as status (status)}
								<DropdownMenu.Item
									disabled={status === view.todo.status}
									onSelect={() => onstatus?.(view.todo.id, status)}
								>
									{todoStatusLabels[status]}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Group>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</Card.Action>
		{/if}
	</Card.Header>
	{#if hasBadges}
		<Card.Content class="flex flex-wrap items-center gap-1.5 px-4">
			{#if projectName}
				<Badge variant="brand">{projectName}</Badge>
			{/if}
			{#if view.todo.dueDate}
				<Badge
					variant="ghost"
					class={overdue ? 'bg-destructive/10 text-destructive' : 'text-muted-foreground'}
					>{formatDate(view.todo.dueDate)}</Badge
				>
			{/if}
			{#if showPriority && view.todo.priority}
				<Badge variant="ghost" class={todoPriorityStyle[view.todo.priority].badgeClass}
					>{todoPriorityLabels[view.todo.priority]}</Badge
				>
			{/if}
		</Card.Content>
	{/if}
	{#if hasFooter}
		<Card.Content class="flex items-center justify-between gap-2 px-4">
			<span class="flex min-w-0 items-center gap-1.5">
				{#if view.provenance}
					<ProvenanceDot
						provenance={view.provenance}
						anchor={view.anchor}
						sourceTitle={view.sourceNote?.title}
						href={view.sourceNote ? `/notes/${view.sourceNote.id}` : undefined}
					/>
				{/if}
				{#if view.sourceNote}
					<span class="provenance-caption max-w-[14ch] truncate">{view.sourceNote.title}</span>
				{/if}
			</span>
			{#if waiting}
				<span class="shrink-0 text-xs text-muted-foreground">
					Waiting on {view.todo.waitingOn ?? 'someone'}
				</span>
			{/if}
		</Card.Content>
	{/if}
</Card.Root>
