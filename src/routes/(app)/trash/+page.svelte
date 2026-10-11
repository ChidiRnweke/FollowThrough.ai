<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import TrashList from '$lib/components/shared/trash-list.svelte';
	import {
		diagramTrashEntry,
		noteTrashEntry,
		widgetTrashEntry,
		type TrashEntry
	} from '$lib/components/shared/trash-entry';
	import { deleteNoteForever, emptyNoteTrash } from '$lib/remote/projects/projects.remote';
	import { changeDiagramTrash } from '$lib/stores/diagrams/trash-actions';
	import { widgetEdits } from '$lib/stores/widgets/widget-edits.svelte';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	const inventoryReady = $derived(data.session.resources.collectionReadiness() === 'ready');

	// One list, newest first, so "what did I just delete" is the top row whichever
	// kind it was. Sorting per kind would bury a diagram under older notes.
	const entries = $derived(
		[
			...workspaceViews.trashedNotes().map(noteTrashEntry),
			...workspaceViews.trashedDiagrams().flatMap((diagram) => {
				const project = workspaceViews.get('projects', diagram.projectId);
				return project ? [diagramTrashEntry(diagram, project.name)] : [];
			}),
			...workspaceViews.trashedWidgets().flatMap((widget) => {
				const project = workspaceViews.get('projects', widget.projectId);
				return project ? [widgetTrashEntry(widget, project.name)] : [];
			})
		].sort((left, right) => right.archivedAt.localeCompare(left.archivedAt))
	);

	async function restore(entry: TrashEntry): Promise<void> {
		if (entry.kind === 'widget') {
			if ((await widgetEdits.changeTrash(entry.id, 'restore')).kind === 'staged')
				toast.success('Restored');
			return;
		}
		if (entry.kind === 'diagram') {
			await changeDiagramTrash(entry.id, 'restore');
			toast.success('Restored');
			return;
		}
		const restored = await workspaceSession.edit(
			{ type: 'notes', id: [entry.id] },
			{ kind: 'restoreNote', noteId: entry.id }
		);
		if (restored.kind === 'failure') toast.error(restored.message);
		else toast.success('Restored');
	}

	async function remove(entry: TrashEntry): Promise<void> {
		if (entry.kind === 'widget') {
			if ((await widgetEdits.changeTrash(entry.id, 'delete')).kind === 'staged')
				toast.success('Deleted permanently');
			return;
		}
		if (entry.kind === 'diagram') {
			await changeDiagramTrash(entry.id, 'delete');
			toast.success('Deleted permanently');
			return;
		}
		const deleted = await workspaceSession.serverChange(deleteNoteForever({ noteId: entry.id }));
		if (deleted.kind === 'failure') toast.error(deleted.message);
		// A folder takes its contents with it, so the count is what actually went.
		else
			toast.success(deleted.value.deletedNoteIds.length === 1 ? 'Deleted' : 'Deleted permanently');
	}

	/**
	 * Empties both kinds, because the button says "Empty trash" and the list holds
	 * both. Diagrams go one call at a time — there is no bulk delete for them — so
	 * this is not atomic; a failure part-way leaves the rest in the trash, which
	 * the reloaded list then shows honestly.
	 */
	async function empty(): Promise<void> {
		for (const entry of entries) {
			if (entry.kind === 'diagram') await changeDiagramTrash(entry.id, 'delete');
			if (entry.kind === 'widget') await widgetEdits.changeTrash(entry.id, 'delete');
		}
		const emptied = await workspaceSession.serverChange(emptyNoteTrash({}));
		// Part of the trash may have gone before the failure; show what is left.
		if (emptied.kind === 'failure') await workspaceSession.synchronize();
		if (emptied.kind === 'failure') toast.error(emptied.message);
		else toast.success('Trash emptied');
	}
</script>

<PageShell
	width="wide"
	title="Trash"
	description="Notes, diagrams and widgets you have deleted, across every project. Nothing here is gone yet."
>
	{#if !inventoryReady}
		<p role="status" class="py-6 text-sm text-muted-foreground">
			Trash is not fully available on this device yet.
		</p>
	{/if}
	{#if inventoryReady || entries.length > 0}
		<TrashList
			{entries}
			onrestore={restore}
			ondelete={remove}
			onempty={inventoryReady ? empty : undefined}
		/>
	{/if}
</PageShell>
