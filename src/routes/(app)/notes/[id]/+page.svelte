<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import NoteWorkspace from '$lib/components/app/pages/note-workspace.svelte';
	import { formatDateTime } from '$lib/components/app/labels';

	let { data } = $props();
</script>

{#key data.view.note.id}
	<PageShell
		title={data.view.note.title}
		description="Updated {formatDateTime(data.view.note.updatedAt)}"
	>
		<NoteWorkspace view={data.view} />
	</PageShell>
{/key}
