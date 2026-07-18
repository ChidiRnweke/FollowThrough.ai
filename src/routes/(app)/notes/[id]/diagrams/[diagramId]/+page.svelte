<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import DrawioEditorPage from '$lib/components/app/pages/drawio-editor-page.svelte';

	let { data } = $props();
</script>

<PageShell fill class="max-w-none gap-0 px-4 py-4 md:px-8 md:py-6">
	<DrawioEditorPage diagram={data.diagram} />
</PageShell>
