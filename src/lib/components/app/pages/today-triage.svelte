<script lang="ts">
	import type { NoteSummary, Project, TodayView } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Pin from '@lucide/svelte/icons/pin';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
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
		if (match) rightPanel.openTodo(match);
	}
</script>

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
		{#if !pinned}
			<span class="shrink-0 text-xs text-muted-foreground">{formatDateTime(note.updatedAt)}</span>
		{/if}
	</a>
{/snippet}

<div class="grid gap-6 lg:grid-cols-2">
	<section class="space-y-3" aria-label="Due and overdue todos">
		<h2 class="flex items-center gap-2 text-sm font-semibold">
			Overdue
			{#if view.overdue.length > 0}
				<Badge variant="ghost" class="bg-warning/15 text-warning">{view.overdue.length}</Badge>
			{/if}
		</h2>
		{#if view.overdue.length === 0}
			<p class="text-sm text-muted-foreground">Nothing overdue. Well held.</p>
		{:else}
			{#each view.overdue as item (item.todo.id)}
				<TodoCard
					view={item}
					projectName={projectName(item.todo.projectId)}
					onopen={open}
					onstatus={(id, status) => void todoUpdates.setStatus(id, status)}
				/>
			{/each}
		{/if}
		<h2 class="pt-2 text-sm font-semibold">Due today</h2>
		{#if view.dueToday.length === 0}
			<p class="text-sm text-muted-foreground">Nothing due today.</p>
		{:else}
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
	<section class="space-y-3" aria-label="Waiting on others">
		<h2 class="text-sm font-semibold">Waiting on</h2>
		{#if view.waitingOn.length === 0}
			<p class="text-sm text-muted-foreground">You are not waiting on anyone.</p>
		{:else}
			{#each view.waitingOn as item (item.todo.id)}
				<TodoCard view={item} projectName={projectName(item.todo.projectId)} onopen={open} />
			{/each}
		{/if}
		{#if view.pendingSuggestionCount > 0}
			<a href="/suggestions" class="block">
				<Card.Root class="gap-1 py-3 transition-colors hover:bg-accent">
					<Card.Header class="px-4">
						<Card.Title class="flex items-center gap-2 text-sm font-medium">
							<Inbox class="size-4 text-muted-foreground" />
							Pending suggestions
						</Card.Title>
						<Card.Action>
							<Badge variant="secondary">{view.pendingSuggestionCount}</Badge>
						</Card.Action>
					</Card.Header>
				</Card.Root>
			</a>
		{/if}
	</section>
</div>

<div class="grid gap-6 border-t border-border pt-6 lg:grid-cols-2">
	<section class="space-y-2" aria-label="Pinned notes">
		<h2 class="text-sm font-semibold">Pinned</h2>
		{#each view.pinnedNotes as note (note.id)}
			{@render noteRow(note, true)}
		{:else}
			<p class="text-sm text-muted-foreground">Pin a note to keep it at hand.</p>
		{/each}
	</section>
	<section class="space-y-2" aria-label="Recently edited notes">
		<h2 class="text-sm font-semibold">Recent</h2>
		{#each view.recentNotes as note (note.id)}
			{@render noteRow(note, false)}
		{:else}
			<p class="text-sm text-muted-foreground">Notes you touch will show up here.</p>
		{/each}
	</section>
</div>
