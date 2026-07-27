<script lang="ts">
	import type { NoteLinkTarget } from '$lib/models';
	import { FtDocument as FileText } from '$lib/components/icons';

	let {
		items,
		selected,
		onpick
	}: {
		items: readonly NoteLinkTarget[];
		selected: number;
		onpick: (note: NoteLinkTarget) => void;
	} = $props();
</script>

<!-- Borderless divided rows, like every other list in the app; the popover surface
     supplies the single border. Keyboard selection is owned by the suggestion plugin, so
     this only reflects it. -->
<div
	class="max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-none"
	role="listbox"
	aria-label="Link a note"
>
	{#if items.length === 0}
		<p class="px-2 py-1.5 text-xs text-muted-foreground">No notes in this project match.</p>
	{:else}
		{#each items as note, index (note.id)}
			<button
				type="button"
				role="option"
				aria-selected={index === selected}
				class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
				data-active={index === selected}
				onclick={() => onpick(note)}
			>
				<FileText class="size-3.5 shrink-0 text-muted-foreground" />
				<span class="truncate">{note.title}</span>
			</button>
		{/each}
	{/if}
</div>
