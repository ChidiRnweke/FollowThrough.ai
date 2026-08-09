<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteMap } from 'svelte/reactivity';
	import type { NoteId } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { getTodo } from '$lib/remote/todos/todos.remote';
	import { Button } from '$lib/components/ui/button';
	import {
		FtDocument,
		FtExternal,
		FtFolder,
		FtLoader,
		FtSkills,
		FtTodos
	} from '$lib/components/icons';
	import { turnActivity, turnSteps, type TouchedThing } from '$lib/components/agent';
	import TurnDetailsDialog from './turn-details-dialog.svelte';

	let {
		tools,
		shell,
		settled
	}: {
		tools: readonly ChatToolActivity[];
		shell?: ShellContext;
		/** False while the turn is still working, when the point is watching it happen. */
		settled: boolean;
	} = $props();

	const activity = $derived(turnActivity(tools, shell));
	// Running, the steps arrive one by one in the order they happened; settled, they fold
	// into the things they were about. A list of calls is only interesting while it grows.
	const rows = $derived(settled ? activity.touched : turnSteps(tools, shell));

	let detailsOpen = $state(false);

	/**
	 * `update_todo` names its subject by id alone, so a resolved title is the difference
	 * between a row a user recognises and one they have to open to identify. Same pattern as
	 * the approval card: fetch, degrade silently, never block the row on it.
	 */
	const todoTitles = new SvelteMap<string, string>();
	$effect(() => {
		const unnamed = rows.filter(
			(row) => row.kind === 'todo' && row.id && !row.named && !todoTitles.has(row.id)
		);
		let cancelled = false;
		for (const row of unnamed) {
			const id = row.id as string;
			void getTodo(id)
				.then((todo) => {
					if (!cancelled) todoTitles.set(id, todo.title);
				})
				.catch(() => {
					/* an unnamed todo still opens; it just reads "A todo" */
				});
		}
		return () => {
			cancelled = true;
		};
	});

	const titleOf = (row: TouchedThing): string =>
		(row.id ? todoTitles.get(row.id) : undefined) ?? row.title;

	const icons = {
		note: FtDocument,
		todo: FtTodos,
		project: FtFolder,
		skill: FtSkills
	};

	/**
	 * Each kind opens where that kind lives — and none of them may cost the reader the panel
	 * they clicked in. `openTodoSurface` is the obvious reuse and is wrong here: docked, it
	 * hands the right panel to the todo and the conversation is gone.
	 */
	function open(row: TouchedThing): void {
		if (!row.id) return;
		if (row.kind === 'note' || row.kind === 'skill') {
			void workbench.openTab(row.id as NoteId);
			return;
		}
		if (row.kind === 'todo') {
			const returnTo = `${page.url.pathname}${page.url.search}`;
			void goto(`/todos/${row.id}?returnTo=${encodeURIComponent(returnTo)}`);
			return;
		}
		void goto(`/projects/${row.id}`);
	}
</script>

{#snippet rowBody(row: TouchedThing)}
	{@const Icon = icons[row.kind]}
	{#if row.pending}
		<FtLoader class="size-3.5 shrink-0 animate-spin text-muted-foreground" />
	{:else}
		<Icon class="size-3.5 shrink-0 text-muted-foreground" />
	{/if}
	<span class="min-w-0 flex-1 truncate {row.failed ? 'text-destructive' : ''}">{titleOf(row)}</span>
	<span class="shrink-0 text-muted-foreground">{row.verb}</span>
{/snippet}

{#if rows.length > 0 || activity.failures.length > 0 || activity.callCount > 0}
	<!--
		What the turn did, in the user's things rather than in calls. 4px binds the rows to
		each other; 8px separates them from the door to the log, which is a different kind of
		thing. No dividers: two or three rows inside a turn are not a page list, and hairlines
		here would outweigh the transcript they sit in.
	-->
	<div class="flex flex-col gap-2">
		{#each activity.failures as failure (failure)}
			<p class="text-xs text-destructive" role="alert">{failure}</p>
		{/each}

		{#if rows.length > 0}
			<ul class="flex flex-col">
				{#each rows as row, index (`${row.kind}-${row.id ?? row.title}-${index}`)}
					<li>
						{#if row.id}
							<!-- `justify-start` and `font-normal` are neutralised explicitly: the
							     variant's centring and weight have no counterpart here and would
							     otherwise survive into a row that has to read as a list item. -->
							<Button
								variant="ghost"
								size="sm"
								class="group/touched h-auto w-full justify-start gap-2 px-2 py-1.5 text-xs font-normal"
								onclick={() => open(row)}
							>
								{@render rowBody(row)}
								<FtExternal
									class="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--duration-micro) group-hover/touched:opacity-100"
								/>
							</Button>
						{:else}
							<!-- Nothing to open, so nothing that looks like it opens. -->
							<div class="flex w-full items-center gap-2 px-2 py-1.5 text-xs">
								{@render rowBody(row)}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if activity.callCount > 0}
			<Button
				variant="ghost"
				size="xs"
				class="self-start text-muted-foreground"
				onclick={() => (detailsOpen = true)}
			>
				Details
			</Button>
		{/if}
	</div>

	<TurnDetailsDialog bind:open={detailsOpen} {tools} {shell} />
{/if}
