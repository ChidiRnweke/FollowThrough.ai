<script lang="ts">
	import type { SourceLine } from '$lib/models/notes/note-diff';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { untrack } from 'svelte';

	/**
	 * The line diff of an edited diagram, under the diagram it changed. A rendered diagram
	 * shows that something moved, never which line of its source did, so the source is a
	 * door below the picture rather than a replacement for it.
	 */
	let {
		lines,
		open = false,
		onOpenChange
	}: {
		lines: readonly SourceLine[];
		/** Where the disclosure starts, so a rebuilt widget reopens if the reader had opened it. */
		open?: boolean;
		onOpenChange: (open: boolean) => void;
	} = $props();

	let expanded = $state(untrack(() => open));

	const SIGN = { context: ' ', removed: '−', added: '+' } as const;
	const LINE_CLASS = {
		context: 'note-diff-source-line',
		removed: 'note-diff-source-line note-diff-source-removed',
		added: 'note-diff-source-line note-diff-source-added'
	} as const;
</script>

<Collapsible.Root class="note-diff-source" bind:open={expanded} {onOpenChange}>
	<Collapsible.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="sm" class="h-7 px-1 text-muted-foreground">
				Source changes
			</Button>
		{/snippet}
	</Collapsible.Trigger>
	<Collapsible.Content>
		<pre class="note-diff-source-lines"><code
				>{#each lines as line, index (index)}<span class={LINE_CLASS[line.kind]}
						><span aria-hidden="true">{SIGN[line.kind]} </span>{#if line.kind !== 'context'}<span
								class="sr-only">{line.kind === 'added' ? 'Added: ' : 'Removed: '}</span
							>{/if}{line.text}</span
					>{/each}</code
			></pre>
	</Collapsible.Content>
</Collapsible.Root>
