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
		FtEllipsis,
		FtExternal,
		FtFolder,
		FtLoader,
		FtSkills,
		FtTodos
	} from '$lib/components/icons';
	import { turnActivity, turnSteps, type TouchedThing } from '$lib/components/agent';
	import TurnDetailsDialog from './turn-details-dialog.svelte';
	import TurnFailure from './turn-failure.svelte';

	let {
		tools,
		turnTools,
		shell,
		showLog = false,
		retryable = false,
		onretry
	}: {
		tools: readonly ChatToolActivity[];
		/** Every call of the turn, so a failure put right later in it is not reported here. */
		turnTools?: readonly ChatToolActivity[];
		shell?: ShellContext;
		/**
		 * Whether this group carries the turn's log. Set on the last group only: the log is one
		 * door per turn, not one per group — several "1 step" rows down a turn are doors onto
		 * attempts the agent already put right, and say nothing on their way past.
		 */
		showLog?: boolean;
		/** Whether the run this group belongs to can be run again. */
		retryable?: boolean;
		onretry?: () => void;
	} = $props();

	const activity = $derived(turnActivity(tools, shell, turnTools ?? tools));
	// A group is a run of consecutive calls, so it settles on its own rather than with the
	// turn. Running, its steps arrive one by one in the order they happened; settled, they
	// fold into the things they were about — a list of calls is only interesting as it grows.
	const settled = $derived(!tools.some((tool) => tool.status === 'running'));
	// A thing that failed is stated once, by the failure below, which says what went wrong
	// and what to do about it. A red row above saying the same name is the duplication all
	// over again.
	const rows = $derived(
		(settled ? activity.touched : turnSteps(tools, shell)).filter((row) => !row.failed)
	);

	/** Every call of the turn, which is what the log opens onto. */
	const logged = $derived(turnTools ?? tools);
	const stepCount = $derived(logged.length);
	const hasLog = $derived(showLog && stepCount > 0);

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
	<!-- A phrase, not a table row: pushing the verb to the far edge with `flex-1` made two
	     entries scan as the columns of a table that has no other rows. -->
	<span class="min-w-0 truncate {row.failed ? 'text-destructive' : ''}">{titleOf(row)}</span>
	<span class="shrink-0 text-muted-foreground">· {row.verb}</span>
{/snippet}

{#if rows.length > 0 || activity.failures.length > 0 || hasLog}
	<!--
		What the turn did, in the user's things rather than in calls. The log is the last row
		of the same list rather than a caption below it, so it carries the same hover wash and
		reads as the same kind of clickable thing. No dividers: two or three rows inside a turn
		are not a page list, and hairlines here would outweigh the transcript they sit in.
	-->
	<div class="flex flex-col gap-2">
		<!-- What went wrong leads: it is the one thing here that might need something from the
		     reader. The record of what did work, and the door to the evidence, follow. -->
		{#each activity.failures as failed (failed.callId)}
			<TurnFailure tool={failed} {shell} {retryable} {onretry} />
		{/each}

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
			{#if hasLog}
				<!-- The log joins the list rather than sitting under it as a caption: as bare
				     ghost-button text, nothing said it could be clicked. It states its count
				     instead of announcing itself. -->
				<li>
					<Button
						variant="ghost"
						size="sm"
						class="group/touched h-auto w-full justify-start gap-2 px-2 py-1.5 text-xs font-normal text-muted-foreground"
						onclick={() => (detailsOpen = true)}
					>
						<FtEllipsis class="size-3.5 shrink-0" />
						<span class="min-w-0 truncate">{stepCount === 1 ? '1 step' : `${stepCount} steps`}</span
						>
						<FtExternal
							class="size-3 shrink-0 opacity-0 transition-opacity duration-(--duration-micro) group-hover/touched:opacity-100"
						/>
					</Button>
				</li>
			{/if}
		</ul>
	</div>

	<TurnDetailsDialog bind:open={detailsOpen} tools={logged} {shell} />
{/if}
