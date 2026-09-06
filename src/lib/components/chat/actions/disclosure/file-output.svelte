<script lang="ts">
	import type { FileOutputLine } from '$lib/components/agent';

	let {
		lines,
		bounded = true
	}: {
		lines: readonly FileOutputLine[];
		/** False in the dialog, where the passage has the height to be read rather than skimmed. */
		bounded?: boolean;
	} = $props();
</script>

<!--
	What the agent saw: the matched lines, the excerpt, the entries.

	No headline. It used to say "1 match" directly above one match, "3 entries" above three
	entries — the count and the thing it counted, ten pixels apart, saying the same fact twice.
	Show the passage and the count is on screen already.

	No source header either. This renders inside the row for the note it came from, which has
	already named it once and offers to open it; naming it again here was the third `rossel` on
	one screen. A grep that spans several notes files each note's lines under that note's own
	row, so the split is done before this ever renders.

	Bounded in height rather than in count when it sits in the panel: cutting the lines to a
	fixed number would make the rest vanish with no error and no way to tell.
-->
{#if lines.length > 0}
	<div
		class="rounded-md bg-muted/40 px-2 py-1.5 {bounded
			? 'max-h-56 overflow-y-auto overscroll-contain'
			: ''}"
	>
		<ul class="flex flex-col gap-0.5 font-mono text-xs">
			{#each lines as line, index (index)}
				<li class="flex gap-2">
					{#if line.lineNumber !== undefined}
						<span class="shrink-0 text-muted-foreground select-none">{line.lineNumber}</span>
					{/if}
					<span class="min-w-0 break-words whitespace-pre-wrap text-foreground/80">{line.text}</span
					>
				</li>
			{/each}
		</ul>
	</div>
{/if}
