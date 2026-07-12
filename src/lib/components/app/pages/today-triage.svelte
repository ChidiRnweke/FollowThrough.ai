<script lang="ts">
	import type { TodayView } from '$lib/models';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Pin from '@lucide/svelte/icons/pin';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import TodoCard from '../todo-card.svelte';
	import { formatDateTime } from '../labels';

	let { view }: { view: TodayView } = $props();

	function open(todoId: string): void {
		const match = [...view.overdue, ...view.dueToday, ...view.waitingOn].find(
			(item) => item.todo.id === todoId
		);
		if (match) rightPanel.openTodo(match);
	}
</script>

<div class="grid gap-6 lg:grid-cols-2">
	<section class="space-y-3">
		<h2 class="text-sm font-semibold">Overdue</h2>
		{#if view.overdue.length === 0}
			<p class="text-sm text-muted-foreground">Nothing overdue. Well held.</p>
		{:else}
			{#each view.overdue as item (item.todo.id)}
				<TodoCard
					view={item}
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
					onopen={open}
					onstatus={(id, status) => void todoUpdates.setStatus(id, status)}
				/>
			{/each}
		{/if}
	</section>
	<section class="space-y-3">
		<h2 class="text-sm font-semibold">Waiting on</h2>
		{#if view.waitingOn.length === 0}
			<p class="text-sm text-muted-foreground">You are not waiting on anyone.</p>
		{:else}
			{#each view.waitingOn as item (item.todo.id)}
				<TodoCard view={item} onopen={open} />
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

<div class="grid gap-6 lg:grid-cols-2">
	<section class="space-y-2">
		<h2 class="text-sm font-semibold">Pinned</h2>
		{#each view.pinnedNotes as note (note.id)}
			<a
				href="/notes/{note.id}"
				class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
			>
				<Pin class="size-3.5 text-muted-foreground" />
				{note.title}
			</a>
		{:else}
			<p class="text-sm text-muted-foreground">Pin a note to keep it at hand.</p>
		{/each}
	</section>
	<section class="space-y-2">
		<h2 class="text-sm font-semibold">Recent</h2>
		{#each view.recentNotes as note (note.id)}
			<a
				href="/notes/{note.id}"
				class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
			>
				<span class="truncate">{note.title}</span>
				<span class="shrink-0 text-xs text-muted-foreground">{formatDateTime(note.updatedAt)}</span>
			</a>
		{:else}
			<p class="text-sm text-muted-foreground">Notes you touch will show up here.</p>
		{/each}
	</section>
</div>
