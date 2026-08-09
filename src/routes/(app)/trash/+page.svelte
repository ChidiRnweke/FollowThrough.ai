<script lang="ts">
	import type { NoteId } from '$lib/models/notes';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { NoteTrashList } from '$lib/components/notes';
	import { projectActions } from '$lib/stores/projects/project-actions.svelte';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	async function restore(noteId: NoteId): Promise<void> {
		const output = await projectActions.restoreNote(noteId);
		if (!output) toast.error(projectActions.lastError ?? 'Could not restore the note. Try again.');
		else toast.success('Restored');
	}

	async function remove(noteId: NoteId): Promise<void> {
		const output = await projectActions.deleteNoteForever(noteId);
		if (!output) toast.error(projectActions.lastError ?? 'Could not delete the note. Try again.');
		// A folder takes its contents with it, so the count is what actually went.
		else toast.success(output.deletedNoteIds.length === 1 ? 'Deleted' : 'Deleted permanently');
	}

	async function empty(): Promise<void> {
		const output = await projectActions.emptyNoteTrash();
		if (!output) toast.error(projectActions.lastError ?? 'Could not empty the trash. Try again.');
		else toast.success('Trash emptied');
	}
</script>

<PageShell
	width="wide"
	title="Trash"
	description="Notes you have deleted, across every project. Nothing here is gone yet."
>
	<NoteTrashList notes={data.trashed} onrestore={restore} ondelete={remove} onempty={empty} />
</PageShell>
