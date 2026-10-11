<script lang="ts">
	import type { TodayView } from '$lib/models/workspace-views';

	import type { NoteSummary } from '$lib/models/notes';
	import type { Project } from '$lib/models/projects';
	import type { TodoId, TodoStatus } from '$lib/models/todos';

	import * as Icon from '$lib/components/icons';
	import EmptyState from '../../shared/empty-state.svelte';
	import { openTodoSurface } from '$lib/client/shell/responsive-surfaces';
	import { page } from '$app/state';
	import { todoUpdates } from '$lib/components/todos';
	import TodoRow from '../../todos/todo-row.svelte';
	import { formatDateTime } from '../../shared/labels';

	let { view, projects = [] }: { view: TodayView; projects?: readonly Project[] } = $props();

	const projectsById = $derived(new Map(projects.map((project) => [project.id, project])));

	function projectName(projectId: string): string | undefined {
		return projectsById.get(projectId as Project['id'])?.name;
	}

	function open(todoId: string): void {
		const match = [...view.overdue, ...view.dueToday, ...view.waitingOn].find(
			(item) => item.todo.id === todoId
		);
		if (match) openTodoSurface(match, `${page.url.pathname}${page.url.search}`);
	}

	const setStatus = (id: TodoId, status: TodoStatus) => void todoUpdates.setStatus(id, status);

	/* Composition follows content: a section with nothing in it reserves no space,
	   and the remaining sections take the full width. */
	const todoGroups = $derived(
		[
			{ label: 'Overdue', items: view.overdue, actionable: true },
			{ label: 'Due today', items: view.dueToday, actionable: true },
			{ label: 'Waiting on', items: view.waitingOn, actionable: false }
		].filter((group) => group.items.length > 0)
	);
</script>

{#snippet stat(label: string, count: number, tone: string, zero: string, some: string)}
	<div class="flex flex-col gap-bind">
		<span class="text-sm text-muted-foreground">{label}</span>
		<span class={['stat-value', count > 0 ? tone : 'text-muted-foreground']}>{count}</span>
		<span class="text-xs text-muted-foreground">{count > 0 ? some : zero}</span>
	</div>
{/snippet}

{#snippet noteRow(note: NoteSummary, pinned: boolean)}
	<a
		href="/notes/{note.id}"
		class="row-interactive flex items-baseline gap-2 rounded-md px-2 py-1.5 text-sm"
	>
		{#if pinned}
			<Icon.Pin class="size-3.5 shrink-0 self-center text-muted-foreground" />
		{/if}
		<span class="min-w-0 flex-1 truncate">{note.title}</span>
		{#if projectName(note.projectId)}
			<span class="shrink-0 text-xs text-brand">{projectName(note.projectId)}</span>
		{/if}
		<span class="shrink-0 text-xs text-muted-foreground">{formatDateTime(note.updatedAt)}</span>
	</a>
{/snippet}

<!-- Three typographic groups, no containers: spacing groups them, and a zero
     recedes to muted ink so the count that needs attention leads. -->
<section class="grid grid-cols-1 gap-group sm:grid-cols-3" aria-label="Today at a glance">
	{@render stat(
		'Overdue',
		view.overdue.length,
		'text-destructive',
		'Nothing overdue. Well held.',
		`${view.overdue.length} to catch up on`
	)}
	{@render stat(
		'Due today',
		view.dueToday.length,
		'text-warning',
		'Nothing due today.',
		`${view.dueToday.length} to finish`
	)}
	{@render stat(
		'Waiting on',
		view.waitingOn.length,
		'text-foreground',
		'Not waiting on anyone.',
		`${view.waitingOn.length} pending`
	)}
</section>

{#if todoGroups.length > 0}
	<div class="flex flex-col gap-group">
		{#each todoGroups as group (group.label)}
			<section class="flex flex-col gap-item" aria-label={group.label}>
				<h2 class="eyebrow">{group.label}</h2>
				<!-- -mx-2 hangs the row padding outside the column so titles align with the eyebrow. -->
				<div class="-mx-2 divide-y divide-border">
					{#each group.items as item (item.todo.id)}
						<TodoRow
							view={item}
							projectName={projectName(item.todo.projectId)}
							onopen={open}
							onstatus={group.actionable ? setStatus : undefined}
						/>
					{/each}
				</div>
			</section>
		{/each}
	</div>
{/if}

<!-- Pinned takes a column only when it has notes; empty, it is one quiet line
     above a full-width Recent rather than half the page holding an invitation. -->
<div class={['grid gap-group', view.pinnedNotes.length > 0 && 'lg:grid-cols-2']}>
	<section class="flex flex-col gap-item" aria-label="Pinned notes">
		<h2 class="eyebrow">Pinned</h2>
		{#each view.pinnedNotes as note (note.id)}
			{@render noteRow(note, true)}
		{:else}
			<EmptyState
				icon={Icon.Pin}
				title="Pin a note to keep it at hand."
				class="flex-row justify-start gap-2 py-0 text-left"
			/>
		{/each}
	</section>
	<section class="flex flex-col gap-item" aria-label="Recently edited notes">
		<h2 class="eyebrow">Recent</h2>
		{#each view.recentNotes as note (note.id)}
			{@render noteRow(note, false)}
		{:else}
			<EmptyState icon={Icon.Document} title="Notes you touch show up here." />
		{/each}
	</section>
</div>
