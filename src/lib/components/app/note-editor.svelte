<script lang="ts">
	import { untrack } from 'svelte';
	import type { NoteId, ProseMirrorDocument } from '$lib/models';
	import { createEditor } from '$lib/components/edra/commands/editor.js';
	import { TodoNode } from '$lib/components/edra/commands/TodoNode.js';
	import Tiptap from '$lib/components/edra/Tiptap.svelte';
	import EdraEditor from '$lib/components/edra/editor.svelte';
	import BubbleMenu from '$lib/components/edra/BubbleMenu.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Separator } from '$lib/components/ui/separator';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import Link2 from '@lucide/svelte/icons/link-2';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Workflow from '@lucide/svelte/icons/workflow';
	import { editorSelection } from '$lib/stores/editor-selection.svelte';
	import TodoNodeView from './todo-node.svelte';

	export type NoteAiAction = 'promises' | 'relate' | 'reference' | 'diagram';

	let {
		noteId,
		revision,
		document,
		onchange,
		onaction
	}: {
		noteId: NoteId;
		revision: number;
		document: ProseMirrorDocument;
		onchange?: () => void;
		onaction?: (action: NoteAiAction) => void;
	} = $props();

	let initialized = false;
	const editor = createEditor(
		{
			onUpdate: () => {
				if (initialized) onchange?.();
			}
		},
		[TodoNode(TodoNodeView as never)]
	);

	if (editor) {
		// Initial content only; the page remounts per note via {#key}.
		editor.commands.setContent(untrack(() => document) as never);
		initialized = true;
		editor.on('selectionUpdate', ({ editor: current }) => {
			const { from, to, empty } = current.state.selection;
			if (empty) {
				editorSelection.clear();
			} else {
				editorSelection.set({
					noteId,
					revision,
					from,
					to,
					text: current.state.doc.textBetween(from, to, ' ')
				});
			}
		});
	}

	export function getDocument(): ProseMirrorDocument {
		return (editor?.getJSON() ?? { type: 'doc', content: [] }) as unknown as ProseMirrorDocument;
	}
</script>

{#if editor}
	<Tiptap {editor}>
		<BubbleMenu
			{editor}
			class="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-none"
		>
			<Button variant="ghost" size="sm" onclick={() => onaction?.('promises')}>
				<ClipboardCheck class="size-4" />
				Extract promises
			</Button>
			<Button variant="ghost" size="sm" onclick={() => onaction?.('relate')}>
				<Link2 class="size-4" />
				Relate
			</Button>
			<Button variant="ghost" size="sm" onclick={() => onaction?.('reference')}>
				<BookOpen class="size-4" />
				Reference
			</Button>
			<Separator orientation="vertical" class="h-5" />
			<Button variant="ghost" size="sm" onclick={() => onaction?.('diagram')}>
				<Workflow class="size-4" />
				Diagram
			</Button>
		</BubbleMenu>
		<EdraEditor class="prose max-w-none dark:prose-invert" />
	</Tiptap>
{:else}
	<div class="space-y-3">
		<Skeleton class="h-5 w-3/4" />
		<Skeleton class="h-5 w-full" />
		<Skeleton class="h-5 w-2/3" />
	</div>
{/if}
