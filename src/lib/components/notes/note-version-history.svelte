<script lang="ts">
	import type { Note, NoteId, NoteRevision, NoteRevisionSummary } from '$lib/models/notes';
	import type { Diagram } from '$lib/models/diagrams';
	import { countNoteDiff, diffNoteDocuments, withTitleBlock } from '$lib/models/notes/note-diff';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Spinner } from '$lib/components/ui/spinner';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import ConfirmDelete from '$lib/components/shared/confirm-delete.svelte';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { FtHistory } from '$lib/components/icons';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { cn } from '$lib/utils';
	import NoteVersionDiff from './note-version-diff.svelte';

	let {
		open = $bindable(false),
		note,
		revisions,
		loading = false,
		selectedId = $bindable(undefined),
		selected,
		perNote,
		diagrams,
		noteId,
		onselect,
		onrestore
	}: {
		open?: boolean;
		/** The note as it stands — always the right-hand side of the diff. */
		note: Pick<Note, 'title' | 'plainText' | 'document' | 'publishedRevision' | 'currentRevision'>;
		revisions: readonly NoteRevisionSummary[];
		loading?: boolean;
		selectedId?: NoteRevision['id'];
		/** The full body of `selectedId`, once its fetch settles. */
		selected?: NoteRevision;
		/** Per-note stores so embedded todos resolve against this note. */
		perNote?: PerNoteEditorSlot;
		/** The note's diagrams, so draw.io blocks render their preview in the panes. */
		diagrams?: readonly Diagram[];
		noteId?: NoteId;
		onselect: (revisionId: NoteRevision['id']) => void;
		onrestore: (revisionId: NoteRevision['id']) => Promise<void>;
	} = $props();

	let restoring = $state(false);

	const hasDraft = $derived(note.currentRevision > note.publishedRevision);

	// The change summary belongs to the revision the reader picked, so it is shown
	// once, in that row, rather than repeated above the panes.
	const counts = $derived(
		selected
			? countNoteDiff(
					diffNoteDocuments(
						withTitleBlock(selected.document, selected.title),
						withTitleBlock(note.document, note.title)
					)
				)
			: undefined
	);

	async function restore(revisionId: NoteRevision['id']): Promise<void> {
		restoring = true;
		try {
			await onrestore(revisionId);
			open = false;
		} finally {
			restoring = false;
		}
	}

	function choose(revisionId: NoteRevision['id']): void {
		selectedId = revisionId;
		onselect(revisionId);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="dialog-fill flex flex-col sm:max-w-7xl">
		<Dialog.Header>
			<Dialog.Title>Version history</Dialog.Title>
			<Dialog.Description>Compare a previous publication with the current draft.</Dialog.Description
			>
		</Dialog.Header>

		{#if revisions.length === 0}
			<EmptyState
				icon={FtHistory}
				title="No versions yet"
				hint="Publishing this note takes its first snapshot."
			/>
		{:else}
			<div class="grid min-h-0 flex-1 gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
				<ul class="min-h-0 divide-y divide-border overflow-y-auto pr-1" aria-label="Versions">
					{#each revisions as revision (revision.id)}
						<li>
							<Button
								variant="ghost"
								aria-current={selectedId === revision.id ? 'true' : undefined}
								class={cn(
									'h-auto min-h-11 w-full flex-col items-stretch gap-0 rounded-md px-3 py-2 text-left',
									selectedId === revision.id ? 'bg-primary/5' : ''
								)}
								onclick={() => choose(revision.id)}
							>
								<span class="flex items-center justify-between gap-2">
									<!-- The dialog already belongs to one note, so the row identifies the
									     revision by when it was taken; the version number and a repeated
									     note title told the reader nothing they did not already know. -->
									<span class="truncate text-sm font-medium">
										{formatRelativeTime(revision.createdAt)}
									</span>
									{#if revision.isPublished}
										<Badge variant="secondary">Published</Badge>
									{/if}
								</span>
								{#if selectedId === revision.id && counts}
									<span class="block pt-0.5 text-xs font-normal text-muted-foreground">
										{counts.added} added · {counts.removed} removed
									</span>
								{/if}
							</Button>
						</li>
					{/each}
				</ul>

				<div class="min-h-0 overflow-hidden">
					{#if loading}
						<p class="flex items-center gap-2 py-6 text-sm text-muted-foreground">
							<Spinner />Loading that version…
						</p>
					{:else if selected}
						<NoteVersionDiff
							base={selected.document}
							candidate={note.document}
							baseTitle={selected.title}
							candidateTitle={note.title}
							baseLabel="Previous"
							baseSublabel={`Published ${formatRelativeTime(selected.createdAt)}`}
							candidateLabel={hasDraft ? 'Current draft' : 'Current note'}
							candidateSublabel={hasDraft ? 'Includes unpublished changes' : undefined}
							showCounts={false}
							{perNote}
							{diagrams}
							{noteId}
						/>
					{:else}
						<p class="py-6 text-sm text-muted-foreground">
							Pick a version on the left to compare it with the note as it stands.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		<Dialog.Footer class="sm:items-center sm:justify-between">
			{#if selected}
				<p class="text-xs text-muted-foreground">Your current draft remains in history.</p>
			{/if}
			<div class="flex flex-wrap items-center justify-end gap-2">
				<Button variant="outline" onclick={() => (open = false)}>Close</Button>
				{#if selected}
					<ConfirmDelete
						title="Restore this version?"
						description="The note's current content is replaced. It stays in the history, so you can undo this the same way."
						confirmLabel="Restore"
						busy={restoring}
						onconfirm={() => restore(selected.id)}
					>
						{#snippet trigger(props)}
							<Button {...props} class="min-h-11" disabled={restoring}>
								{#if restoring}<Spinner data-icon="inline-start" />{/if}
								Restore previous version
							</Button>
						{/snippet}
					</ConfirmDelete>
				{/if}
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
