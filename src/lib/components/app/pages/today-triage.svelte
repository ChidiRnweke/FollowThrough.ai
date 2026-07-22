<script lang="ts">
	import type { NoteSummary, Project, TodayView } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import Pin from '@lucide/svelte/icons/pin';
	import { openTodoSurface } from '$lib/navigation/responsive-surfaces';
	import { page } from '$app/state';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import TodoCard from '../todo-card.svelte';
	import { formatDateTime } from '../labels';

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

	const hasActionable = $derived(
		view.overdue.length > 0 || view.dueToday.length > 0 || view.waitingOn.length > 0
	);
</script>

{#snippet statTile(label: string, count: number, tone: string, zero: string, some: string)}
	<Card.Root class="gap-0 py-4">
		<Card.Content class="flex flex-col gap-1 px-4">
			<span class="text-sm text-muted-foreground">{label}</span>
			<span
				class={['text-2xl font-semibold tabular-nums', count > 0 ? tone : 'text-muted-foreground']}
			>
				{count}
			</span>
			<span class="text-xs text-muted-foreground">{count > 0 ? some : zero}</span>
		</Card.Content>
	</Card.Root>
{/snippet}

{#snippet noteRow(note: NoteSummary, pinned: boolean)}
	<a
		href="/notes/{note.id}"
		class="row-interactive flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
	>
		{#if pinned}
			<Pin class="size-3.5 shrink-0 text-muted-foreground" />
		{/if}
		<span class="min-w-0 flex-1 truncate">{note.title}</span>
		{#if projectName(note.projectId)}
			<Badge variant="outline" class="shrink-0 text-muted-foreground">
				{projectName(note.projectId)}
			</Badge>
		{/if}
		<span class="shrink-0 text-xs text-muted-foreground">{formatDateTime(note.updatedAt)}</span>
	</a>
{/snippet}

<section class="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Today at a glance">
	{@render statTile(
		'Overdue',
		view.overdue.length,
		'text-destructive',
		'Nothing overdue. Well held.',
		`${view.overdue.length} to catch up on`
	)}
	{@render statTile(
		'Due today',
		view.dueToday.length,
		'text-warning',
		'Nothing due today.',
		`${view.dueToday.length} to finish`
	)}
	{@render statTile(
		'Waiting on',
		view.waitingOn.length,
		'text-foreground',
		'Not waiting on anyone.',
		`${view.waitingOn.length} pending`
	)}
</section>

{#if hasActionable}
	<div class="grid gap-6 lg:grid-cols-2">
		<section class="space-y-3" aria-label="Due and overdue todos">
			{#if view.overdue.length > 0}
				<h2 class="eyebrow">Overdue</h2>
				{#each view.overdue as item (item.todo.id)}
					<TodoCard
						view={item}
						projectName={projectName(item.todo.projectId)}
						onopen={open}
						onstatus={(id, status) => void todoUpdates.setStatus(id, status)}
					/>
				{/each}
			{/if}
			{#if view.dueToday.length > 0}
				<h2 class="eyebrow" class:pt-2={view.overdue.length > 0}>Due today</h2>
				{#each view.dueToday as item (item.todo.id)}
					<TodoCard
						view={item}
						projectName={projectName(item.todo.projectId)}
						onopen={open}
						onstatus={(id, status) => void todoUpdates.setStatus(id, status)}
					/>
				{/each}
			{/if}
		</section>
		{#if view.waitingOn.length > 0}
			<section class="space-y-3" aria-label="Waiting on others">
				<h2 class="eyebrow">Waiting on</h2>
				{#each view.waitingOn as item (item.todo.id)}
					<TodoCard view={item} projectName={projectName(item.todo.projectId)} onopen={open} />
				{/each}
			</section>
		{/if}
	</div>
{/if}

<div class="grid gap-6 border-t border-border pt-6 lg:grid-cols-2">
	<section class="space-y-2" aria-label="Pinned notes">
		<h2 class="eyebrow">Pinned</h2>
		{#each view.pinnedNotes as note (note.id)}
			{@render noteRow(note, true)}
		{:else}
			<p class="text-sm text-muted-foreground">Pin a note to keep it at hand.</p>
		{/each}
	</section>
	<section class="space-y-2" aria-label="Recently edited notes">
		<h2 class="eyebrow">Recent</h2>
		{#each view.recentNotes as note (note.id)}
			{@render noteRow(note, false)}
		{:else}
			<p class="text-sm text-muted-foreground">Notes you touch will show up here.</p>
		{/each}
	</section>
</div>
