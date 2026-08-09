<script lang="ts">
	// The trash is a promise the rest of the app makes: "Move to trash" says the note
	// survives, and this list is where that turns out to be true. It stays deliberately
	// plain — a name, where it came from, when it went — because the only thing anyone
	// comes here to do is find one note and bring it back. Deleting for good is the one
	// thing here that breaks that promise, so it stays secondary and always asks first.
	import type { NoteId, TrashedNote } from '$lib/models/notes';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import ConfirmDelete from '$lib/components/shared/confirm-delete.svelte';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import { FtTrash } from '$lib/components/icons';
	import { formatRelativeTime } from '$lib/components/shared/labels';

	let {
		notes,
		/** Hidden when every row shares one project, where the column would repeat itself. */
		showProject = true,
		emptyTitle = 'The trash is empty',
		emptyHint = 'Notes you move to the trash land here, and can be restored from it.',
		onrestore,
		ondelete,
		onempty
	}: {
		notes: readonly TrashedNote[];
		showProject?: boolean;
		emptyTitle?: string;
		emptyHint?: string;
		onrestore: (noteId: NoteId) => Promise<void>;
		/** Omitted where permanent deletion is not offered; the row then only restores. */
		ondelete?: (noteId: NoteId) => Promise<void>;
		onempty?: () => Promise<void>;
	} = $props();

	let restoringId = $state<NoteId | undefined>(undefined);
	let deletingId = $state<NoteId | undefined>(undefined);
	let emptying = $state(false);

	const busy = $derived(restoringId !== undefined || deletingId !== undefined || emptying);

	async function restore(noteId: NoteId): Promise<void> {
		restoringId = noteId;
		try {
			await onrestore(noteId);
		} finally {
			restoringId = undefined;
		}
	}

	async function remove(noteId: NoteId): Promise<void> {
		deletingId = noteId;
		try {
			await ondelete?.(noteId);
		} finally {
			deletingId = undefined;
		}
	}

	async function empty(): Promise<void> {
		emptying = true;
		try {
			await onempty?.();
		} finally {
			emptying = false;
		}
	}

	/** Named so the confirmation says what is about to go, contents included. */
	function deleteDescription(note: TrashedNote): string {
		return note.kind === 'folder'
			? `“${note.title}” and any notes inside it will be deleted permanently. This cannot be undone.`
			: `“${note.title}” will be deleted permanently. This cannot be undone.`;
	}
</script>

{#if notes.length === 0}
	<EmptyState icon={FtTrash} title={emptyTitle} hint={emptyHint} />
{:else}
	{#if onempty}
		<div class="flex justify-end pb-2">
			<ConfirmDelete
				title="Empty the trash?"
				description="Every note in the trash will be deleted permanently. This cannot be undone."
				confirmLabel="Empty trash"
				busy={emptying}
				onconfirm={empty}
			>
				{#snippet trigger(props)}
					<Button {...props} variant="ghost" size="sm" class="text-destructive" disabled={busy}>
						{#if emptying}<Spinner data-icon="inline-start" />{/if}
						Empty trash
					</Button>
				{/snippet}
			</ConfirmDelete>
		</div>
	{/if}
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
				<div class="flex shrink-0 items-center gap-1">
					<Button variant="outline" size="sm" disabled={busy} onclick={() => void restore(note.id)}>
						{#if restoringId === note.id}<Spinner data-icon="inline-start" />{/if}
						Restore
					</Button>
					{#if ondelete}
						<ConfirmDelete
							title="Delete this note forever?"
							description={deleteDescription(note)}
							confirmLabel="Delete forever"
							busy={deletingId === note.id}
							onconfirm={() => remove(note.id)}
						>
							{#snippet trigger(props)}
								<Button
									{...props}
									variant="ghost"
									size="sm"
									class="text-muted-foreground hover:text-destructive"
									disabled={busy}
									aria-label="Delete {note.title} forever"
								>
									{#if deletingId === note.id}<Spinner />{:else}<FtTrash class="size-4" />{/if}
								</Button>
							{/snippet}
						</ConfirmDelete>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
