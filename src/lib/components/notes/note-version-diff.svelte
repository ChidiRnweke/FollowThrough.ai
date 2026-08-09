<script lang="ts">
	import type { NoteId, ProseMirrorDocument } from '$lib/models/notes';
	import type { Diagram } from '$lib/models/diagrams';
	import { countNoteDiff, diffNoteDocuments, withTitleBlock } from '$lib/models/notes/note-diff';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import { cn } from '$lib/utils';
	import NoteDiffEditor from './note-diff-editor.svelte';

	let {
		base,
		candidate,
		baseLabel,
		candidateLabel,
		baseSublabel,
		candidateSublabel,
		baseTitle,
		candidateTitle,
		caption,
		compact = false,
		layout = 'split',
		showCounts = true,
		perNote,
		diagrams,
		noteId
	}: {
		base: ProseMirrorDocument;
		candidate: ProseMirrorDocument;
		baseLabel: string;
		candidateLabel: string;
		baseSublabel?: string;
		candidateSublabel?: string;
		/**
		 * The two sides' note titles. Supplied together, they head each document so a
		 * rename reads as a changed first line; callers that show the title change
		 * themselves leave them unset rather than saying it twice.
		 */
		baseTitle?: string;
		candidateTitle?: string;
		/** What the two sides are, in the reader's terms. Every caller compares a different pair. */
		caption?: string;
		compact?: boolean;
		/**
		 * `candidate` drops the baseline pane and keeps the change marks. Two panes in a
		 * 384px column are two ~150px columns wrapping one word per line, which is not a
		 * comparison — where there is no room for both, showing the proposed document alone
		 * and offering the comparison elsewhere is the honest trade.
		 */
		layout?: 'split' | 'candidate';
		/** Off where the caller shows the summary somewhere better, e.g. beside the version. */
		showCounts?: boolean;
		perNote?: PerNoteEditorSlot;
		diagrams?: readonly Diagram[];
		noteId?: NoteId;
	} = $props();

	const withTitles = $derived(baseTitle !== undefined && candidateTitle !== undefined);
	const baseDocument = $derived(
		withTitles ? (withTitleBlock(base, baseTitle ?? '') as ProseMirrorDocument) : base
	);
	const candidateDocument = $derived(
		withTitles
			? (withTitleBlock(candidate, candidateTitle ?? '') as ProseMirrorDocument)
			: candidate
	);
	const diff = $derived(diffNoteDocuments(baseDocument, candidateDocument));
	const counts = $derived(countNoteDiff(diff));
</script>

<section
	class="flex h-full min-h-0 flex-col"
	aria-label={layout === 'split' ? `${baseLabel} compared with ${candidateLabel}` : candidateLabel}
>
	{#if caption || (showCounts && (counts.added || counts.removed))}
		<div class="flex flex-wrap items-baseline gap-x-2 px-1">
			{#if caption}
				<p class="text-xs text-muted-foreground">{caption}</p>
			{/if}
			{#if showCounts && (counts.added || counts.removed)}
				<p class="provenance-caption" aria-label="Change summary">
					{counts.added} added · {counts.removed} removed
				</p>
			{/if}
		</div>
	{/if}
	<div
		class={cn(
			'@container/diff min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-background',
			caption || (showCounts && (counts.added || counts.removed)) ? 'mt-2' : '',
			compact ? 'mt-1.5 max-h-64 flex-none' : ''
		)}
	>
		<!-- The split answers to the width it is given, not to the window's: at `sm:` a
		     384px panel on a wide desktop got two columns it had no room for, and each side
		     wrapped a word per line. -->
		<div
			class={cn(
				'grid min-w-0',
				layout === 'split' ? '@2xl/diff:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''
			)}
		>
			{#if layout === 'split'}
				<NoteDiffEditor
					document={baseDocument}
					kinds={diff.base}
					label={baseLabel}
					sublabel={baseSublabel}
					{perNote}
					{diagrams}
					{noteId}
					class="min-w-0 border-b border-border @2xl/diff:border-b-0 @2xl/diff:border-r @2xl/diff:border-border"
				/>
			{/if}
			<NoteDiffEditor
				document={candidateDocument}
				kinds={diff.candidate}
				label={candidateLabel}
				sublabel={candidateSublabel}
				{perNote}
				{diagrams}
				{noteId}
				class="min-w-0"
			/>
		</div>
	</div>
</section>
