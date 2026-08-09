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
		frame = 'box',
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
		 * How the two sides are arranged. `split` is the side-by-side comparison, which needs
		 * real width — in a 384px column it becomes two ~150px columns wrapping one word per
		 * line. `stacked` is the same comparison for a narrow column: both sides at full
		 * width, before above after. `candidate` drops the baseline pane entirely, for the
		 * cases where there is nothing to compare against.
		 */
		layout?: 'split' | 'stacked' | 'candidate';
		/**
		 * `bare` drops the border and fill, for a caller that has already marked out the region
		 * it sits in. A framed preview inside a framed surface is two same-weight rectangles,
		 * and the change washes are the whole signal anyway.
		 */
		frame?: 'box' | 'bare';
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

	/** Stacked and compact, each half is bounded so the second is never below the fold. */
	const stackedPane = $derived(
		layout === 'stacked' && compact ? 'max-h-40 overflow-y-auto overscroll-contain' : ''
	);
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
			'@container/diff min-h-0 flex-1 overflow-y-auto overscroll-contain',
			frame === 'box' ? 'rounded-md border border-border bg-background' : '',
			caption || (showCounts && (counts.added || counts.removed)) ? 'mt-2' : '',
			// Stacked, each half owns its own scroll below, so capping the pair as well would
			// hide the second one behind a scroll nobody expects.
			compact ? (layout === 'stacked' ? 'mt-1.5 flex-none' : 'mt-1.5 max-h-64 flex-none') : ''
		)}
	>
		<!-- The split answers to the width it is given, not to the window's: at `sm:` a
		     384px panel on a wide desktop got two columns it had no room for, and each side
		     wrapped a word per line. Stacked, the same two sides run full width instead. -->
		<div
			class={cn(
				'grid min-w-0',
				layout === 'split' ? '@2xl/diff:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''
			)}
		>
			{#if layout !== 'candidate'}
				<NoteDiffEditor
					document={baseDocument}
					kinds={diff.base}
					label={baseLabel}
					sublabel={baseSublabel}
					{compact}
					{perNote}
					{diagrams}
					{noteId}
					class={cn(
						'min-w-0 border-b border-border @2xl/diff:border-r @2xl/diff:border-border',
						layout === 'split' ? '@2xl/diff:border-b-0' : '',
						stackedPane
					)}
				/>
			{/if}
			<!--
				A lone pane needs no header: there is no other column for it to be told apart
				from, and the caller has already named what is being changed. Stacked, the two
				headers are the only thing saying which half is which. The editor's `aria-label`
				carries the label either way.
			-->
			<NoteDiffEditor
				document={candidateDocument}
				kinds={diff.candidate}
				label={candidateLabel}
				sublabel={candidateSublabel}
				showLabel={layout !== 'candidate'}
				{compact}
				{perNote}
				{diagrams}
				{noteId}
				class={cn('min-w-0', stackedPane)}
			/>
		</div>
	</div>
</section>
