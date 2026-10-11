<script lang="ts">
	let {
		id,
		title,
		count,
		description
	}: { id: string; title: string; count?: number; description: string } = $props();
</script>

<!--
	The count sits in the title's own line, so number and words share a baseline; the description
	is the line beneath. A large number beside a two-line block can never line up with either.
-->
<header class="flex flex-col gap-bind">
	<h2 {id} class="section-title flex items-baseline gap-2">
		{title}
		{#if count !== undefined}
			<span class="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>
		{/if}
	</h2>
	<p class="text-sm text-muted-foreground">{description}</p>
</header>
