<script lang="ts">
	import type { HeadingLinkTarget } from './commands/HeadingLinkSuggestion.js';
	import { FtDocument as FileText } from '$lib/components/icons';

	let {
		items,
		selected,
		onpick
	}: {
		items: readonly HeadingLinkTarget[];
		selected: number;
		onpick: (heading: HeadingLinkTarget) => void;
	} = $props();
</script>

<!-- Same divided-rows popover as the note link list; keyboard selection is owned
     by the suggestion plugin, so this only reflects it. -->
<div
	class="max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-none"
	role="listbox"
	aria-label="Link a heading"
>
	{#if items.length === 0}
		<p class="px-2 py-1.5 text-xs text-muted-foreground">No headings in this note match.</p>
	{:else}
		{#each items as heading, index (heading.id)}
			<button
				type="button"
				role="option"
				aria-selected={index === selected}
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
				data-active={index === selected}
				onclick={() => onpick(heading)}
			>
				<FileText class="size-3.5 shrink-0 text-muted-foreground" />
				<span class="truncate" style:padding-left="{(heading.level - 1) * 0.75}rem">
					{heading.textContent}
				</span>
				<span class="ml-auto shrink-0 text-xs text-muted-foreground">H{heading.level}</span>
			</button>
		{/each}
	{/if}
</div>
