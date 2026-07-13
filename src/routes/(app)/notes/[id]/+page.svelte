<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import NoteBreadcrumb from '$lib/components/app/note-breadcrumb.svelte';
	import NoteWorkspace from '$lib/components/app/pages/note-workspace.svelte';

	let { data } = $props();
</script>

{#key data.view.note.id}
	<PageShell fill class="max-w-none gap-3 px-3 py-4 md:px-8">
		{#snippet header()}
			<div class="mx-auto w-full max-w-[75ch]">
				<NoteBreadcrumb shell={data.shell} note={data.view.note} />
			</div>
		{/snippet}
		<NoteWorkspace view={data.view} shell={data.shell} />
	</PageShell>
{/key}
