<script lang="ts">
	import type { FileOutputLine } from '$lib/components/agent';
	import { CHAT_TEXT_EVIDENCE } from '../chat-row';

	let {
		lines,
		place = 'panel'
	}: {
		lines: readonly FileOutputLine[];
		/**
		 * Where this is being read, which decides both its height and its size.
		 *
		 * One field rather than a `bounded` flag beside a size prop: the two never vary apart. In
		 * the panel the passage is skimmed in a 340px column, so it is capped in height and set at
		 * the evidence rung. In the dialog it is read, so it is neither. A caller cannot ask for
		 * the small size at full height, because there is no such place.
		 */
		place?: 'panel' | 'dialog';
	} = $props();

	const panel = $derived(place === 'panel');
</script>

<!--
	What the agent saw: the matched lines, the excerpt, the entries.

	No headline. It used to say "1 match" directly above one match, "3 entries" above three
	entries — the count and the thing it counted, ten pixels apart, saying the same fact twice.
	Show the passage and the count is on screen already.

	No source header either. This renders inside the row for the note it came from, which has
	already named it once and offers to open it; naming it again here was the third `atlas` on
	one screen. A grep that spans several notes files each note's lines under that note's own
	row, so the split is done before this ever renders.

	Bounded in height rather than in count when it sits in the panel: cutting the lines to a
	fixed number would make the rest vanish with no error and no way to tell.

	The teal wash is what makes it a surface. On `bg-muted/40` over paper this was very nearly
	the same colour as the page it sat on, so quoted output and the app's own words ran together.
	The ink follows from the wash and not from taste: grey and translucent text on a coloured
	surface are both ruled out (docs/design/design-system.md, "Text on colored surfaces"), so the
	gutter takes the opaque hue-matched token and the content takes full `foreground`.
-->
{#if lines.length > 0}
	<div
		class="rounded-md bg-brand/10 px-2 py-1.5 dark:bg-brand/15 {panel
			? 'max-h-56 overflow-y-auto overscroll-contain'
			: ''}"
	>
		<!-- audit-allow: no-raw-font-family — File lines are code output; mono is the code face. -->
		<ul class="flex flex-col gap-0.5 font-mono {panel ? CHAT_TEXT_EVIDENCE : 'text-sm'}">
			{#each lines as line, index (index)}
				<li class="flex gap-2">
					{#if line.lineNumber !== undefined}
						<span class="shrink-0 text-brand-muted-foreground select-none">{line.lineNumber}</span>
					{/if}
					<span class="min-w-0 break-words whitespace-pre-wrap text-foreground">{line.text}</span>
				</li>
			{/each}
		</ul>
	</div>
{/if}
