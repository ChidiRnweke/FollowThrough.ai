<script lang="ts">
	import type { FileOutputLine } from '$lib/components/agent';

	let {
		headline,
		lines
	}: {
		headline: string;
		lines: readonly FileOutputLine[];
	} = $props();
</script>

<!--
	What a look inside the virtual files came back with: the matches, the excerpt, the
	entries. Bounded in height rather than in count — cutting the lines to a fixed number
	would make the rest vanish with no error and no way to tell, so the block scrolls. When
	there are no lines the headline is the whole answer ("No matches"), so nothing else
	renders.
-->
<div class="flex flex-col gap-1">
	<p>{headline}</p>
	{#if lines.length > 0}
		<div class="max-h-56 overflow-y-auto overscroll-contain rounded-md bg-muted/40 px-2 py-1.5">
			<ul class="flex flex-col gap-0.5 font-mono text-xs">
				{#each lines as line, index (index)}
					<li class="flex gap-2">
						{#if line.context !== undefined}
							<span
								class="max-w-28 shrink-0 truncate text-muted-foreground/60 select-none"
								title={line.context}>{line.context}</span
							>
						{/if}
						<span class="min-w-0 break-words whitespace-pre-wrap text-foreground/80"
							>{line.text}</span
						>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
