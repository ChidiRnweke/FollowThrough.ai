<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import TrashList from '$lib/components/shared/trash-list.svelte';
	import {
		diagramTrashEntry,
		noteTrashEntry,
		type TrashEntry
	} from '$lib/components/shared/trash-entry';
	import { projectActions } from '$lib/stores/projects/project-actions.svelte';
	import {
		deleteProjectDiagram,
		restoreProjectDiagram
	} from '$lib/remote/diagrams/diagrams.remote';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	// One list, newest first, so "what did I just delete" is the top row whichever
	// kind it was. Sorting per kind would bury a diagram under older notes.
	const entries = $derived(
		[
			...data.trashedNotes.map(noteTrashEntry),
			...data.trashedDiagrams.map((row) => diagramTrashEntry(row.diagram, row.projectName))
		].sort((left, right) => right.archivedAt.localeCompare(left.archivedAt))
	);

	async function restore(entry: TrashEntry): Promise<void> {
		if (entry.kind === 'diagram') {
			await restoreProjectDiagram({ diagramId: entry.id });
			await invalidateAll();
			toast.success('Restored');
			return;
		}
		const output = await projectActions.restoreNote(entry.id);
		if (!output) toast.error(projectActions.lastError ?? 'Could not restore the note. Try again.');
		else toast.success('Restored');
	}

	async function remove(entry: TrashEntry): Promise<void> {
		if (entry.kind === 'diagram') {
			await deleteProjectDiagram({ diagramId: entry.id });
			await invalidateAll();
			toast.success('Deleted permanently');
			return;
		}
		const output = await projectActions.deleteNoteForever(entry.id);
		if (!output) toast.error(projectActions.lastError ?? 'Could not delete the note. Try again.');
		// A folder takes its contents with it, so the count is what actually went.
		else toast.success(output.deletedNoteIds.length === 1 ? 'Deleted' : 'Deleted permanently');
	}

	/**
	 * Empties both kinds, because the button says "Empty trash" and the list holds
	 * both. Diagrams go one call at a time — there is no bulk delete for them — so
	 * this is not atomic; a failure part-way leaves the rest in the trash, which
	 * the reloaded list then shows honestly.
	 */
	async function empty(): Promise<void> {
		for (const entry of entries) {
			if (entry.kind === 'diagram') await deleteProjectDiagram({ diagramId: entry.id });
		}
		const output = await projectActions.emptyNoteTrash();
		await invalidateAll();
		if (!output) toast.error(projectActions.lastError ?? 'Could not empty the trash. Try again.');
		else toast.success('Trash emptied');
	}
</script>

<PageShell
	width="wide"
	title="Trash"
	description="Notes and diagrams you have deleted, across every project. Nothing here is gone yet."
>
	<TrashList {entries} onrestore={restore} ondelete={remove} onempty={empty} />
</PageShell>
