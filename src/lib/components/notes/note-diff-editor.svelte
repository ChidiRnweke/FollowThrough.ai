<script lang="ts">
	import type { NoteId, ProseMirrorDocument } from '$lib/models/notes';
	import type { Diagram } from '$lib/models/diagrams';
	import type { DiffSideBlock } from '$lib/models/notes/note-diff';
	import SafeSvgPreview from '$lib/components/shared/safe-svg-preview.svelte';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import { createEditor } from '$lib/components/edra/commands/editor';
	import { TodoNode } from '$lib/components/edra/commands/TodoNode.js';
	import TodoNodeView from '../todos/todo-node.svelte';
	import { Plugin, PluginKey } from '@tiptap/pm/state';
	import { Decoration, DecorationSet } from '@tiptap/pm/view';
	import { cn } from '$lib/utils';
	import { untrack } from 'svelte';
	import '../edra/editor.css';

	let {
		document,
		kinds,
		label,
		sublabel,
		perNote,
		diagrams,
		noteId,
		class: className
	}: {
		document: ProseMirrorDocument;
		/** Classification of each top-level block of `document`, in order. */
		kinds: readonly DiffSideBlock[];
		label: string;
		/** A quieter second line under the label, e.g. a date or provenance note. */
		sublabel?: string;
		perNote?: PerNoteEditorSlot;
		/** The note's diagrams, so draw.io blocks render their preview instead of a placeholder. */
		diagrams?: readonly Diagram[];
		noteId?: NoteId;
		class?: string;
	} = $props();

	// The read-only editor renders the same schema and node views as the note, so
	// diagrams, code, callouts and todos look exactly as they do in the document.
	// The node views hide their controls because they check `editor.isEditable`.
	// Built once, so the pane label is captured at creation — a pane's label never
	// changes for the lifetime of its editor.
	const editor = untrack(() =>
		createEditor(
			{
				editable: false,
				ariaLabel: `Read-only preview of ${label}`,
				// Note links stay inert in a review pane: there is no pane to open them in,
				// and a click must not navigate away from the comparison.
				onOpenNoteLink: () => true,
				// Read the props inside the closures: `createEditor` runs once, so capturing
				// them here would pin whatever the first render happened to pass. Without a
				// diagram list the draw.io node falls back to its own placeholder.
				getDrawioDiagram: (reference) => {
					const candidate = diagrams?.find((diagram) => diagram.id === reference);
					return candidate?.kind === 'drawio' ? candidate : undefined;
				},
				resolveDrawioHref: (reference) =>
					noteId ? `/notes/${noteId}/diagrams/${reference}` : undefined,
				drawioPreview: SafeSvgPreview
			},
			[TodoNode(TodoNodeView as never)]
		)
	);

	const diffKey = new PluginKey('note-diff-highlight');

	const createHighlightPlugin = (blocks: readonly DiffSideBlock[]) =>
		new Plugin({
			key: diffKey,
			props: {
				decorations(state) {
					// `setContent` may normalise the document, so only paint when the
					// block count matches the classification we were given; a mismatch
					// degrades to no highlight rather than a mislabelled one.
					if (blocks.length !== state.doc.childCount) return null;
					const decorations: Decoration[] = [];
					state.doc.forEach((node, offset, index) => {
						const kind = blocks[index]?.kind;
						if (kind && kind !== 'context') {
							decorations.push(
								Decoration.node(offset, offset + node.nodeSize, {
									class: `diff-block diff-${kind}`
								})
							);
						}
					});
					return DecorationSet.create(state.doc, decorations);
				}
			}
		});

	let rootEl: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (!editor || !rootEl) return;
		if (!editor.view.dom?.parentNode) return;
		const element = rootEl;
		// eslint-disable-next-line svelte/no-dom-manipulating
		rootEl.append(...editor.view.dom.parentNode.childNodes);
		editor.setOptions({ element });
		editor.createNodeViews();
	});

	// Three separate effects, because `setContent` resets the pane's scroll: a
	// reader mid-comparison must not be thrown back to the top because the other
	// side's classification changed. Re-registering the plugin dispatches its own
	// state update, so decorations still repaint without touching the document.
	$effect(() => {
		if (editor) editor.perNote = perNote;
	});

	$effect(() => {
		if (!editor) return;
		editor.unregisterPlugin(diffKey);
		editor.registerPlugin(createHighlightPlugin(kinds));
	});

	$effect(() => {
		if (!editor) return;
		editor.commands.setContent(
			document as unknown as Parameters<typeof editor.commands.setContent>[0]
		);
	});
</script>

<div class={cn('note-diff-pane flex min-h-0 min-w-0 flex-col', className)}>
	<header
		class="sticky top-0 z-10 flex min-w-0 items-baseline justify-between gap-2 border-b border-border bg-background px-3 py-1.5"
	>
		<span class="truncate text-xs font-semibold">{label}</span>
		{#if sublabel}
			<span class="provenance-caption truncate">{sublabel}</span>
		{/if}
	</header>
	<div class="prose min-w-0 flex-1 px-4 pt-2 pb-4 dark:prose-invert">
		<div bind:this={rootEl} class="tiptap note-diff-content"></div>
	</div>
</div>
