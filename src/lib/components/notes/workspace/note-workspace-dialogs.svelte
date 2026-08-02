<script lang="ts">
	import type { DiagramSuggestion } from '$lib/models/diagrams';
	import type { Note, NoteSyncRecord } from '$lib/models/notes';
	import { DrawioReviewDialog } from '$lib/components/diagrams';
	import ExportDialog from '../export/export-dialog.svelte';
	import NoteConflictDialog from '../note-conflict-dialog.svelte';

	let {
		exportOpen = $bindable(false),
		conflictOpen = $bindable(false),
		reviewDialogOpen = $bindable(false),
		note,
		conflictRecord,
		reviewingSuggestion,
		onUseRemote,
		onKeepLocal,
		onAcceptDrawio
	}: {
		exportOpen?: boolean;
		conflictOpen?: boolean;
		reviewDialogOpen?: boolean;
		note: Note;
		conflictRecord?: NoteSyncRecord;
		reviewingSuggestion: DiagramSuggestion | null;
		onUseRemote: () => Promise<void>;
		onKeepLocal: () => Promise<void>;
		onAcceptDrawio: (output: { readonly xml: string; readonly svg: string }) => Promise<void>;
	} = $props();
</script>

{#if conflictRecord?.state === 'conflict'}
	<NoteConflictDialog
		bind:open={conflictOpen}
		record={conflictRecord}
		{onUseRemote}
		{onKeepLocal}
	/>
{/if}

<ExportDialog
	bind:open={exportOpen}
	projectId={note.projectId}
	defaultTitle={note.title}
	defaultNoteIds={[note.id]}
	documents={[{ id: note.id, document: note.document }]}
/>

{#if reviewingSuggestion}
	<DrawioReviewDialog
		bind:open={reviewDialogOpen}
		suggestion={reviewingSuggestion}
		onaccept={onAcceptDrawio}
	/>
{/if}
