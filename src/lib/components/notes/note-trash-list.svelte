<script lang="ts">
	// The trash is a promise the rest of the app makes: "Move to trash" says the note
	// survives, and this list is where that turns out to be true. It stays deliberately
	// plain — a name, where it came from, when it went — because the only thing anyone
	// comes here to do is find one note and bring it back.
	import type { NoteId, TrashedNote } from '$lib/models/notes';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { FtTrash } from '$lib/components/icons';
	import { formatRelativeTime } from '$lib/components/shared/labels';

	let {
		notes,
		/** Hidden when every row shares one project, where the column would repeat itself. */
		showProject = true,
		emptyTitle = 'The trash is empty',
		emptyHint = 'Notes you move to the trash land here, and can be restored from it.',
		onrestore
	}: {
		notes: readonly TrashedNote[];
		showProject?: boolean;
		emptyTitle?: string;
		emptyHint?: string;
		onrestore: (noteId: NoteId) => Promise<void>;
	} = $props();

	let restoringId = $state<NoteId | undefined>(undefined);

	async function restore(noteId: NoteId): Promise<void> {
		restoringId = noteId;
		try {
			await onrestore(noteId);
		} finally {
			restoringId = undefined;
		}
	}
</script>

{#if notes.length === 0}
	<EmptyState icon={FtTrash} title={emptyTitle} hint={emptyHint} />
{:else}
	<ul class="divide-y divide-border" aria-label="Notes in the trash">
		{#each notes as note (note.id)}
			<li class="flex items-center justify-between gap-3 py-2.5">
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{note.title}</p>
					<p class="truncate text-xs text-muted-foreground">
						{#if showProject}{note.projectName} ·
						{/if}{note.kind === 'folder' ? 'Folder' : 'Note'} · Trashed {formatRelativeTime(
							note.archivedAt
						)}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={restoringId !== undefined}
					onclick={() => void restore(note.id)}
				>
					{#if restoringId === note.id}<Spinner data-icon="inline-start" />{/if}
					Restore
				</Button>
			</li>
		{/each}
	</ul>
{/if}
