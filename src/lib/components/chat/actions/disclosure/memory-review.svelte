<script lang="ts">
	import type { MemoryEntry } from '$lib/models/memory';
	import { getEntries } from '$lib/remote/memory/memory.remote';
	import { FtMemory, FtPlus } from '$lib/components/icons';
	import { CHAT_ROW, CHAT_ROW_ICON } from '../chat-row';

	let {
		projectId,
		operation,
		content
	}: {
		/** Absent for a fact about the user rather than about one project. */
		projectId?: string;
		operation?: string;
		content?: string;
	} = $props();

	/**
	 * Everything already remembered in the scope this would join, so the proposal is judged
	 * against the set rather than on its own. A single sentence in isolation is almost always
	 * worth remembering; the question is whether it repeats, contradicts, or supersedes one of
	 * the twenty already there, and that question cannot be asked without them on screen.
	 *
	 * Fetched on first expand. Degrades to the proposal alone: a list that would not load is a
	 * reason to show less, never a reason to hide what was proposed.
	 */
	let existing = $state<readonly MemoryEntry[] | undefined>(undefined);
	let unavailable = $state(false);

	$effect(() => {
		if (existing || unavailable) return;
		let cancelled = false;
		void getEntries(projectId)
			.then((result) => {
				if (!cancelled) existing = result.entries;
			})
			.catch(() => {
				if (!cancelled) unavailable = true;
			});
		return () => {
			cancelled = true;
		};
	});

	const scope = $derived(projectId ? 'this project' : 'you');
	const verb = $derived(
		operation === 'remove' ? 'Forget' : operation === 'update' ? 'Revise' : 'Remember'
	);
</script>

<div class="flex flex-col gap-2">
	<!-- What is being proposed leads: it is the thing the reader has to weigh, and the set
	     underneath is the context for weighing it. -->
	{#if content}
		<div class="flex items-start gap-2 rounded-md bg-brand/10 px-2 py-1.5 dark:bg-brand/15">
			<FtPlus class="{CHAT_ROW_ICON} mt-0.5 text-brand" />
			<div class="flex min-w-0 flex-col gap-0.5">
				<p class="provenance-caption">{verb}, about {scope}</p>
				<p class="break-words text-xs text-foreground">{content}</p>
			</div>
		</div>
	{/if}

	{#if unavailable}
		<p class="text-xs text-muted-foreground">
			What is already remembered could not be loaded, so this stands on its own.
		</p>
	{:else if !existing}
		<p class="text-xs text-muted-foreground">Loading what is already remembered…</p>
	{:else if existing.length === 0}
		<p class="text-xs text-muted-foreground">Nothing is remembered about {scope} yet.</p>
	{:else}
		<div class="flex flex-col gap-1">
			<p class="provenance-caption">Already remembered · {existing.length}</p>
			<ul class="flex flex-col">
				{#each existing as entry (entry.id)}
					<li class="{CHAT_ROW} items-start text-muted-foreground">
						<FtMemory class="{CHAT_ROW_ICON} mt-0.5" />
						<span class="min-w-0 break-words">{entry.content}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
