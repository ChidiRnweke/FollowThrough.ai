<script lang="ts">
	import type { NoteId, ProseMirrorDocument } from '$lib/models/notes';
	import type { Diagram } from '$lib/models/diagrams';
	import type { DiffSideBlock } from '$lib/models/notes/note-diff';
	import SafeSvgPreview from '$lib/components/shared/safe-svg-preview.svelte';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import { createEditor } from '$lib/components/edra/commands/editor';
	import { editorContent } from '$lib/components/edra/commands/document';
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
		showLabel = true,
		compact = false,
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
		/**
		 * Off for a pane that stands alone, where the header would name the only thing on
		 * screen. The `aria-label` keeps carrying `label` either way.
		 */
		showLabel?: boolean;
		/**
		 * A step down in prose scale, for a preview inside a narrow column. Faithful
		 * rendering is the review dialog's contract; at 384px a note's H1 arrives as a
		 * display heading and shouts over the conversation it is embedded in.
		 */
		compact?: boolean;
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
			[TodoNode(TodoNodeView)]
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
					//
					// One normalisation is expected and must not cost the reader the whole
					// diff: the schema keeps a trailing empty paragraph, so a faithfully
					// classified document routinely renders with one block more than it was
					// classified with. Left strict, that silently unpaints every change on a
					// side whose last block is not a paragraph — and the wash is the only
					// signal there is.
					const trailing = state.doc.childCount - blocks.length;
					const last = state.doc.lastChild;
					const paddedByEmptyParagraph =
						trailing === 1 && last?.type.name === 'paragraph' && last.content.size === 0;
					if (trailing !== 0 && !paddedByEmptyParagraph) return null;
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
		editor.commands.setContent(editorContent(document));
	});
</script>

<div
	class={cn('note-diff-pane flex min-h-0 min-w-0 flex-col', className)}
	data-compact={compact ? '' : undefined}
>
	{#if showLabel}
		<header
			class={cn(
				'sticky top-0 z-10 flex min-w-0 items-baseline justify-between gap-2 border-b border-border',
				// A compact pane has no gutter, so neither does its header — otherwise the label
				// sits inset from the content it heads.
				compact ? 'bg-transparent px-0 py-1' : 'bg-background px-3 py-1.5'
			)}
		>
			<span class="truncate text-xs font-semibold">{label}</span>
			{#if sublabel}
				<span class="provenance-caption truncate">{sublabel}</span>
			{/if}
		</header>
	{/if}
	<div
		class={cn(
			'prose min-w-0 flex-1 dark:prose-invert',
			compact ? 'prose-sm px-0 pt-0 pb-2' : 'px-4 pt-2 pb-4'
		)}
	>
		<div bind:this={rootEl} class="tiptap note-diff-content"></div>
	</div>
</div>
