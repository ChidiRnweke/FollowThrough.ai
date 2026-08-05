<script lang="ts">
	import type { DiagramSuggestion } from '$lib/models/diagrams';
	import type {
		Note,
		NoteRevision,
		NoteRevisionId,
		NoteRevisionSummary,
		NoteSyncRecord
	} from '$lib/models/notes';
	import { DrawioReviewDialog } from '$lib/components/diagrams';
	import ExportDialog from '../export/export-dialog.svelte';
	import NoteConflictDialog from '../note-conflict-dialog.svelte';
	import NoteVersionHistory from '../note-version-history.svelte';

	let {
		exportOpen = $bindable(false),
		conflictOpen = $bindable(false),
		reviewDialogOpen = $bindable(false),
		historyOpen = $bindable(false),
		historySelectedId = $bindable(undefined),
		historyRevisions,
		historySelected,
		historyLoading = false,
		note,
		conflictRecord,
		reviewingSuggestion,
		onUseRemote,
		onKeepLocal,
		onAcceptDrawio,
		onSelectRevision,
		onRestoreRevision
	}: {
		exportOpen?: boolean;
		conflictOpen?: boolean;
		reviewDialogOpen?: boolean;
		historyOpen?: boolean;
		historySelectedId?: NoteRevisionId;
		historyRevisions: readonly NoteRevisionSummary[];
		historySelected?: NoteRevision;
		historyLoading?: boolean;
		note: Note;
		conflictRecord?: NoteSyncRecord;
		reviewingSuggestion: DiagramSuggestion | null;
		onUseRemote: () => Promise<void>;
		onKeepLocal: () => Promise<void>;
		onAcceptDrawio: (output: { readonly xml: string; readonly svg: string }) => Promise<void>;
		onSelectRevision: (revisionId: NoteRevisionId) => void;
		onRestoreRevision: (revisionId: NoteRevisionId) => Promise<void>;
	} = $props();
</script>

<NoteVersionHistory
	bind:open={historyOpen}
	bind:selectedId={historySelectedId}
	{note}
	revisions={historyRevisions}
	selected={historySelected}
	loading={historyLoading}
	onselect={onSelectRevision}
	onrestore={onRestoreRevision}
/>

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
