<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import DemoGallery from '$lib/components/app/demo-gallery.svelte';

	let { data } = $props();
</script>

<PageShell
	title="Component gallery"
	description="Every custom composite rendered from demo data. Check light and dark."
>
	<DemoGallery
		todos={data.todos}
		groups={data.groups}
		policies={data.policies}
		noteTree={data.noteTree}
		noteView={data.noteView}
	/>
</PageShell>
