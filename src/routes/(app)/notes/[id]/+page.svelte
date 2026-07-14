<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import NoteWorkspace from '$lib/components/app/pages/note-workspace.svelte';

	let { data } = $props();
</script>

{#key data.view.note.id}
	<PageShell fill class="max-w-none gap-0 px-4 py-4 md:px-10 md:py-6">
		<NoteWorkspace view={data.view} shell={data.shell} />
	</PageShell>
{/key}
