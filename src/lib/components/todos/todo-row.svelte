<script lang="ts">
	import type { LocalDate } from '$lib/models/workspace';
	import type { TodoId, TodoStatus, TodoView } from '$lib/models/todos';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ProvenanceDot from '../references/provenance-dot.svelte';
	import {
		formatDate,
		todayLocalDate,
		todoPriorityLabels,
		todoPriorityStyle
	} from '../shared/labels';
	import * as Icon from '$lib/components/icons';
	import { dragHandle } from 'svelte-dnd-action';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { todoStatusLabels } from '../shared/labels';

	const statuses: readonly TodoStatus[] = ['backlog', 'open', 'in_progress', 'done'];

	let {
		view,
		today = todayLocalDate(),
		projectName,
		onstatus,
		onopen,
		draggable = false,
		lifted = false
	}: {
		view: TodoView;
		today?: LocalDate;
		projectName?: string;
		onstatus?: (todoId: TodoId, status: TodoStatus) => void;
		onopen?: (todoId: TodoId) => void;
		draggable?: boolean;
		/** The row currently held by a drag — `[data-slot='todo-row'][data-lifted]` in layout.css. */
		lifted?: boolean;
	} = $props();

	const done = $derived(view.todo.status === 'done');
	const overdue = $derived(!done && view.todo.dueDate !== undefined && view.todo.dueDate < today);
	const waiting = $derived(view.todo.responsibility === 'waiting_on');
	const showPriority = $derived(view.todo.priority !== undefined && view.todo.priority !== 'low');
	/* Only set values earn a place on the metadata line — an empty field says nothing. */
	const hasMeta = $derived(
		projectName !== undefined ||
			view.todo.dueDate !== undefined ||
			showPriority ||
			view.provenance !== undefined ||
			waiting
	);
	/* Completing plays a short settle before the status change flies the row to
	   Done, so the press reads as an action rather than the row teleporting: the
	   check draws, a line sweeps through the title, and the row shrinks and fades
	   a touch. The wait covers the sweep (--duration-icon-trace). Reopening is
	   immediate. */
	let completing = $state(false);
	function complete(checked: boolean): void {
		if (checked) {
			completing = true;
			setTimeout(() => onstatus?.(view.todo.id, 'done'), 400);
		} else {
			onstatus?.(view.todo.id, 'open');
		}
	}
	function openBody(event: MouseEvent): void {
		if (
			(event.target as HTMLElement).closest('button, a, input, [role="button"], [role="combobox"]')
		)
			return;
		onopen?.(view.todo.id);
	}
</script>

<!-- A divided row, never a card: the list's hairlines separate rows, and the row
     only paints while it is hovered or held. It stays square: `divide-y` borders a
     rounded row along its corners, which bends each hairline into a card edge. Hover and lift live in layout.css
     under [data-slot='todo-row'] so the drag clone, which is a DOM copy outside
     Svelte, picks up the same lifted recipe. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	data-slot="todo-row"
	data-lifted={lifted || undefined}
	class={[
		'relative flex items-start gap-item px-2 py-4 transition-[background-color,opacity,scale] duration-200',
		completing && 'scale-95 opacity-50'
	]}
	onclick={openBody}
>
	<Checkbox
		class="mt-0.5"
		checked={done}
		aria-label={done ? 'Reopen todo' : 'Complete todo'}
		onCheckedChange={(checked) => complete(checked === true)}
	/>
	<div class="flex min-w-0 flex-1 flex-col gap-item">
		{#if onopen}
			<!-- Full wrap, no clamp: a clipped title reads as lost text. Focus shows as
			     an underline, not a ring: Chrome applies :focus-visible to clicked
			     buttons, and a ring leaves a box parked around the open todo's title. -->
			<Button
				type="button"
				variant="ghost"
				class={[
					'tactile h-auto min-w-0 justify-start rounded-sm p-0 text-left text-sm leading-snug font-medium whitespace-normal break-words underline-offset-2 outline-none hover:bg-transparent focus-visible:underline',
					done ? 'text-muted-foreground line-through' : 'text-foreground'
				]}
				onclick={() => onopen(view.todo.id)}
			>
				<!-- The Button lays its children out as flex items, which are blocks; the sweep
				     needs an inline box so each wrapped line gets its own stroke. -->
				{#if completing}<span><span class="strike-sweep">{view.todo.title}</span></span>{:else}{view
						.todo.title}{/if}
			</Button>
		{:else}
			<span
				class={[
					'min-w-0 text-sm leading-snug font-medium break-words',
					done && 'text-muted-foreground line-through'
				]}
				>{#if completing}<span class="strike-sweep">{view.todo.title}</span>{:else}{view.todo
						.title}{/if}</span
			>
		{/if}
		{#if hasMeta}
			<p
				class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
			>
				{#if projectName}
					<span class="text-brand">{projectName}</span>
				{/if}
				{#if view.todo.dueDate}
					<span class={overdue ? 'text-destructive' : undefined}
						>{overdue ? 'Overdue' : 'Due'} {formatDate(view.todo.dueDate)}</span
					>
				{/if}
				{#if showPriority && view.todo.priority}
					<span class="inline-flex items-center gap-1">
						<span class={['size-1.5 rounded-full', todoPriorityStyle[view.todo.priority].dotClass]}
						></span>
						{todoPriorityLabels[view.todo.priority]}
					</span>
				{/if}
				{#if waiting}
					<span>Waiting on {view.todo.waitingOn ?? 'someone'}</span>
				{/if}
				{#if view.provenance}
					<span class="inline-flex min-w-0 items-center gap-1">
						<ProvenanceDot
							provenance={view.provenance}
							anchor={view.anchor}
							sourceTitle={view.sourceNote?.title}
							href={view.sourceNote ? `/notes/${view.sourceNote.id}` : undefined}
						/>
						{#if view.sourceNote}
							<span class="max-w-28 truncate">{view.sourceNote.title}</span>
						{/if}
					</span>
				{/if}
			</p>
		{/if}
	</div>
	{#if draggable || onstatus}
		<!-- One trailing cluster. On pointer layouts it overlays the row's top-right
		     corner on hover instead of reserving width at rest (layout.css,
		     [data-row-controls]); on touch it stays in flow and visible. -->
		<div data-row-controls class="-my-1 flex shrink-0 items-center">
			{#if draggable}
				<!-- Trailing, beside the move menu: a leading handle pushed the checkbox a
				     handle's width in from the column title it should line up under.
				     svelte-dnd-action uses a non-passive listener here on purpose: touch
				     dragging calls preventDefault(), so a passive one breaks the handle. -->
				<Tip text="Drag todo">
					{#snippet children({ props })}
						<span
							{...props}
							use:dragHandle
							class="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label="Drag {view.todo.title}"
						>
							<Icon.Grip />
						</span>
					{/snippet}
				</Tip>
			{/if}
			{#if onstatus}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-11 shrink-0 text-muted-foreground sm:size-8"
								aria-label="Move todo"
							>
								<Icon.Ellipsis />
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
			{/if}
		</div>
	{/if}
</div>
