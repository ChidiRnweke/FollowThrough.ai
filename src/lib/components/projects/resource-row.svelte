<script lang="ts">
	// One project space (Todos, Memory, Artifacts, Attachments) as a row in a
	// divided list — never a card. These four are homogeneous and scannable, which
	// is exactly the case the list-before-card rule in DESIGN_SYSTEM.md covers.
	//
	// A populated space shows its `state` ("15 ready to export"); an empty one
	// shows a `tip` saying what the space is for, because a zero is a dead stat
	// and an empty region should invite.
	import type { Component } from 'svelte';

	let {
		href,
		label,
		icon,
		state,
		tip
	}: {
		href: string;
		label: string;
		icon: Component<{ class?: string }>;
		state?: string;
		tip?: string;
	} = $props();

	const Icon = $derived(icon);
</script>

<li>
	<!-- min-h-11 keeps the 44px touch target the box padding used to provide. -->
	<a {href} class="row-interactive flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5">
		<!-- Brand-wash icon chip — the canonical recipe, and the one identity cue
		     that survives the loss of the tile. -->
		<span
			class="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand dark:bg-brand/15"
		>
			<Icon class="size-4.5" />
		</span>
		<span class="flex min-w-0 flex-col gap-0.5">
			<!-- A space outranks a document, so it sits one step up the ladder: base
			     against the documents list's sm. -->
			<span class="truncate text-base font-medium">{label}</span>
			{#if tip}
				<span class="truncate text-sm text-muted-foreground">{tip}</span>
			{/if}
		</span>
		{#if state}
			<span class="ml-auto shrink-0 text-sm text-muted-foreground">{state}</span>
		{/if}
	</a>
</li>
