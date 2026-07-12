<script lang="ts">
	import type { NoteId, NoteSummary } from '$lib/models';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Button } from '$lib/components/ui/button';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import Pin from '@lucide/svelte/icons/pin';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { SvelteMap } from 'svelte/reactivity';

	let {
		notes,
		activeNoteId
	}: {
		notes: readonly NoteSummary[];
		activeNoteId?: NoteId;
	} = $props();

	const active = $derived(notes.filter((note) => note.archivedAt === undefined));
	const roots = $derived(active.filter((note) => note.parentId === undefined));
	const childrenOf = $derived.by(() => {
		const map = new SvelteMap<NoteId, NoteSummary[]>();
		for (const note of active) {
			if (note.parentId !== undefined) {
				map.set(note.parentId, [...(map.get(note.parentId) ?? []), note]);
			}
		}
		return map;
	});
</script>

{#snippet leaf(note: NoteSummary, indent: boolean)}
	<Button
		variant="ghost"
		size="sm"
		href="/notes/{note.id}"
		class="w-full justify-start gap-2 overflow-hidden font-normal {indent
			? 'pl-8'
			: ''} {note.id === activeNoteId
			? 'bg-accent text-accent-foreground'
			: 'text-sidebar-foreground'}"
	>
		{#if note.kind === 'skill'}
			<Wrench class="size-4 shrink-0 text-muted-foreground" />
		{:else}
			<FileText class="size-4 shrink-0 text-muted-foreground" />
		{/if}
		<span class="truncate" title={note.title}>{note.title}</span>
		{#if note.isPinned}
			<Pin class="ml-auto size-3.5 shrink-0 text-muted-foreground" />
		{/if}
	</Button>
{/snippet}

<div role="navigation" aria-label="Notes" class="flex flex-col gap-0.5 overflow-hidden">
	{#each roots as note (note.id)}
		{@const children = childrenOf.get(note.id) ?? []}
		{#if children.length > 0}
			<Collapsible.Root open>
				<div class="flex min-w-0 items-center">
					<Collapsible.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								aria-label="Toggle {note.title}"
								class="shrink-0 [&[data-state=open]>svg]:rotate-90"
							>
								<ChevronRight class="size-4 transition-transform duration-(--duration-micro)" />
							</Button>
						{/snippet}
					</Collapsible.Trigger>
					{@render leaf(note, false)}
				</div>
				<Collapsible.Content class="flex flex-col gap-0.5">
					{#each children as child (child.id)}
						{@render leaf(child, true)}
					{/each}
				</Collapsible.Content>
			</Collapsible.Root>
		{:else}
			{@render leaf(note, false)}
		{/if}
	{/each}
</div>
