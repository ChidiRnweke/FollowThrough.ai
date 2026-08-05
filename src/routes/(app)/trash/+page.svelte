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
</script>

<PageShell
	width="wide"
	title="Trash"
	description="Notes you have deleted, across every project. Nothing here is gone yet."
>
	<NoteTrashList notes={data.trashed} onrestore={restore} />
</PageShell>
