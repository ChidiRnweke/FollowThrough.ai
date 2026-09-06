<script lang="ts">
	import type { EntityRef, FieldChange } from '$lib/components/agent';
	import ChatMarkdown from '../../chat-markdown.svelte';

	let {
		entity,
		changed
	}: {
		entity?: EntityRef;
		changed: readonly FieldChange[];
	} = $props();

	/** Long values are prose the model wrote, so they read as prose rather than as a field. */
	const PROSE_LENGTH = 120;
	const fields = $derived(changed.filter((change) => change.to.length <= PROSE_LENGTH));
	const prose = $derived(changed.filter((change) => change.to.length > PROSE_LENGTH));
</script>

<!--
	What this call set, and what it was before where the tool troubles to say. No mutating tool
	returns a before-image — they hand back the record whole and say nothing about which part of
	it moved — so the arguments are what identify the change, and the field list is honest about
	the difference: `from → to` when there is a before, the value alone when there is not.
-->
<div class="flex flex-col gap-1">
	{#if entity?.named}
		<p class="break-words text-foreground">{entity.title}</p>
	{/if}
	{#each fields as change (change.label)}
		<p class="break-words">
			<span class="text-muted-foreground">{change.label}:</span>
			{#if change.from !== undefined}
				<span class="text-muted-foreground line-through">{change.from}</span>
				<span aria-hidden="true">→</span>
			{/if}
			<span class="text-foreground">{change.to}</span>
		</p>
	{/each}
	{#each prose as change (change.label)}
		<div class="flex flex-col gap-1">
			<p class="provenance-caption">{change.label}</p>
			<!-- Bounded, because a note body pasted whole pushes the rest of the transcript off
			     the screen for a row that is only evidence. -->
			<div class="max-h-56 overflow-y-auto overscroll-contain rounded-md bg-muted/40 px-2 py-1.5">
				<ChatMarkdown content={change.to} />
			</div>
		</div>
	{/each}
</div>
