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
		withTitles ? (withTitleBlock(candidate, candidateTitle ?? '') as ProseMirrorDocument) : candidate
	);
	const diff = $derived(diffNoteDocuments(baseDocument, candidateDocument));
	const counts = $derived(countNoteDiff(diff));
</script>

<section
	class="flex h-full min-h-0 flex-col"
	aria-label={`${baseLabel} compared with ${candidateLabel}`}
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
			'min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border bg-background',
			caption || (showCounts && (counts.added || counts.removed)) ? 'mt-2' : '',
			compact ? 'mt-1.5 max-h-48 flex-none' : ''
		)}
	>
		<div class="grid min-w-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<NoteDiffEditor
				document={baseDocument}
				kinds={diff.base}
				label={baseLabel}
				sublabel={baseSublabel}
				{perNote}
				{diagrams}
				{noteId}
				class="min-w-0 border-b border-border sm:border-b-0 sm:border-r sm:border-border"
			/>
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
