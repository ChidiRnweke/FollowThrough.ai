<script lang="ts">
	import type { NoteId, ProseMirrorDocument } from '$lib/models/notes';
	import type { Diagram } from '$lib/models/diagrams';
	import type { DiffTone, FocusedSideBlock, SourceLine } from '$lib/models/notes/note-diff';
	import { paintDiff } from './note-diff-decorations';
	import NoteDiffSource from './note-diff-source.svelte';
	import SafeSvgPreview from '$lib/components/shared/safe-svg-preview.svelte';
	import type { PerNoteEditorSlot } from './editor-context';
	import { createEditor } from '$lib/components/edra/commands/editor';
	import { MermaidNodeView } from '$lib/components/diagrams';
	import { toEditorContent } from './editor-document';
	import { TodoNode } from '$lib/components/edra/commands/TodoNode.js';
	import { WidgetNode } from '$lib/components/edra/commands/BuiltinExtensions.js';
	import { WidgetNodeView } from '$lib/components/widgets';
	import TodoNodeView from '../todos/todo-node.svelte';
	import { Plugin, PluginKey } from '@tiptap/pm/state';
	import { DecorationSet } from '@tiptap/pm/view';
	import { cn } from '$lib/utils';
	import { mount, unmount, untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import '../edra/editor.css';

	let {
		document,
		kinds,
		label,
		tone,
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
		kinds: readonly FocusedSideBlock[];
		label: string;
		/**
		 * Which side of the comparison this pane is. Its label carries the side's sign, so
		 * the label and the washes beneath it say the same thing without leaning on colour.
		 */
		tone: DiffTone;
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
				mermaidView: MermaidNodeView,
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
			[TodoNode(TodoNodeView), WidgetNode(WidgetNodeView)]
		)
	);

	const diffKey = new PluginKey<DecorationSet>('note-diff-highlight');

	/** A plugin holding one computed set, mapped through any later transaction. */
	const createHighlightPlugin = (initial: DecorationSet) =>
		new Plugin<DecorationSet>({
			key: diffKey,
			state: {
				init: () => initial,
				apply: (transaction, set) => set.map(transaction.mapping, transaction.doc)
			},
			props: {
				decorations: (state) => diffKey.getState(state)
			}
		});

	const mountedSources = new WeakMap<HTMLElement, () => void>();
	/**
	 * Whether each diagram's source disclosure is open, by widget key. ProseMirror may
	 * rebuild a widget when the blocks around it redraw, and a disclosure the reader
	 * opened must not snap shut under them.
	 */
	const openSources = new SvelteMap<string, boolean>();

	const sourceWidget = (lines: readonly SourceLine[], key: string): HTMLElement => {
		const element = globalThis.document.createElement('div');
		element.className = 'note-diff-source-widget';
		element.contentEditable = 'false';
		const component = mount(NoteDiffSource, {
			target: element,
			props: {
				lines,
				open: openSources.get(key) ?? false,
				onOpenChange: (open: boolean) => openSources.set(key, open)
			}
		});
		mountedSources.set(element, () => void unmount(component));
		return element;
	};

	const destroyWidget = (element: HTMLElement) => {
		mountedSources.get(element)?.();
		mountedSources.delete(element);
	};

	/** Bumped once the document is in the editor, so painting reads the rendered blocks. */
	let rendered = $state(0);
	/** The rendered document could not be matched to its classification. */
	let unmarked = $state(false);

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

	// Separate effects, because `setContent` resets the pane's scroll: a reader
	// mid-comparison must not be thrown back to the top because the other side's
	// classification changed. Re-registering the plugin dispatches its own state
	// update, so decorations still repaint without touching the document.
	$effect(() => {
		if (editor) editor.perNote = perNote;
	});

	// Painting reads the rendered document, not the stored one: the editor inserts spacer
	// paragraphs on load, and `paintDiff` maps them out before it marks anything.
	$effect(() => {
		if (!editor || rendered === 0) return;
		const paint = paintDiff({
			doc: editor.state.doc,
			stored: document.content ?? [],
			kinds,
			nodeViews: new Set(Object.keys(editor.extensionManager.nodeViews)),
			sourceWidget,
			destroyWidget
		});
		unmarked = paint.kind === 'failure';
		editor.unregisterPlugin(diffKey);
		editor.registerPlugin(
			createHighlightPlugin(
				DecorationSet.create(
					editor.state.doc,
					paint.kind === 'painted' ? [...paint.decorations] : []
				)
			)
		);
	});

	$effect(() => {
		if (!editor) return;
		editor.commands.setContent(toEditorContent(document));
		rendered = untrack(() => rendered) + 1;
	});
</script>

<div
	class={cn('note-diff-pane flex min-h-0 min-w-0 flex-col', className)}
	data-compact={compact ? '' : undefined}
>
	{#if showLabel}
		<header
			class={cn(
				'flex min-w-0 shrink-0 items-baseline justify-between gap-2',
				// A compact pane has no gutter, so neither does its header — otherwise the label
				// sits inset from the content it heads. It also scrolls its own body, so the
				// header sits above the scroller instead of sticking inside it: it has no fill to
				// match an unknown surface, and a transparent sticky label let the text scrolling
				// under it print straight through. Compact, the label binds to its content by a
				// 4px gap and nothing else: a hairline under it drew the same line as the one
				// between the two halves, and the halves ran together.
				compact ? 'px-0 pb-1' : 'sticky top-0 z-10 border-b border-border bg-background px-3 py-1.5'
			)}
		>
			<span class="truncate text-xs font-semibold">
				<span aria-hidden="true" class={tone === 'removed' ? 'text-destructive' : 'text-brand'}
					>{tone === 'removed' ? '−' : '+'}</span
				>
				{label}
			</span>
			{#if sublabel}
				<span class="provenance-caption truncate">{sublabel}</span>
			{/if}
		</header>
	{/if}
	<div
		class={cn(
			'prose min-w-0 flex-1 dark:prose-invert',
			compact ? 'prose-sm min-h-0 overflow-y-auto px-0 pt-0 pb-2' : 'px-4 pt-2 pb-4'
		)}
	>
		{#if unmarked}
			<p class="mt-0 mb-2 text-xs text-muted-foreground">
				Changes could not be marked in this view.
			</p>
		{/if}
		<div bind:this={rootEl} class="tiptap note-diff-content"></div>
	</div>
</div>
