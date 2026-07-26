<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { ProseMirrorDocument } from '$lib/models';
	import { createEditor } from '$lib/components/edra/commands/editor.js';
	import Tiptap from '$lib/components/edra/Tiptap.svelte';
	import EdraEditor from '$lib/components/edra/editor.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';

	let {
		initialMarkdown,
		ariaLabel,
		compact = false,
		onchange
	}: {
		initialMarkdown: string;
		ariaLabel: string;
		compact?: boolean;
		onchange?: () => void;
	} = $props();

	let initialized = false;
	let hydrated = $state(false);

	// Same edra stack as the note editor, with every AI/diagram/suggestion
	// callback omitted — those features disable cleanly when no handler is passed.
	const editor = createEditor({
		// Read once at creation; the label is fixed for the editor's lifetime.
		ariaLabel: untrack(() => ariaLabel),
		onUpdate: () => {
			if (initialized) onchange?.();
		}
	});

	onMount(() => {
		if (!editor) return;
		// Initial content only; the page remounts via {#key} on import. Without an
		// explicit contentType the Markdown extension assumes 'json' and the source
		// would land as literal text.
		editor.commands.setContent(
			untrack(() => initialMarkdown),
			{ contentType: 'markdown' }
		);
		initialized = true;
		hydrated = true;
	});

	export function getMarkdown(): string {
		return editor?.getMarkdown() ?? '';
	}

	export function getDocument(): ProseMirrorDocument {
		return (editor?.getJSON() ?? { type: 'doc', content: [] }) as unknown as ProseMirrorDocument;
	}

	export function focus(): void {
		editor?.commands.focus('end');
	}
</script>

{#if hydrated && editor}
	<div class={['flex flex-1 flex-col', compact ? 'min-h-24' : 'min-h-96']}>
		<Tiptap {editor}>
			<EdraEditor class="prose flex min-h-full max-w-none flex-1 flex-col dark:prose-invert" />
		</Tiptap>
	</div>
{:else}
	<div class="space-y-3">
		<Skeleton class="h-5 w-3/4" />
		<Skeleton class="h-5 w-full" />
		{#if !compact}
			<Skeleton class="h-5 w-2/3" />
		{/if}
	</div>
{/if}
