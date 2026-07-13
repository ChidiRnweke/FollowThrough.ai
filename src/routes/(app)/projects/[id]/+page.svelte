<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import ProjectOverview from '$lib/components/app/pages/project-overview.svelte';

	let { data } = $props();
</script>

{#key data.view.project.id}
	<PageShell
		title={data.view.project.name}
		description={data.view.project.description ?? 'Notes and todos for this project.'}
	>
		<ProjectOverview view={data.view} />
	</PageShell>
{/key}
