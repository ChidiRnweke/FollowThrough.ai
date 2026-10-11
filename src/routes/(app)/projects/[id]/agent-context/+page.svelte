<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { ProjectContextUsage } from '$lib/components/projects';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';

	let { data } = $props();
	const project = $derived(workspaceViews.get('projects', data.projectId));
</script>

{#if project && !project.archivedAt}
	<PageShell
		title="Agent context"
		description="What the agent read in {project.name}, what it never has, and what it could not find."
	>
		<!-- Ancestors only: the trailing crumb would restate the h1 directly beneath it. -->
		{#snippet breadcrumb()}
			<Breadcrumb.Root>
				<Breadcrumb.List>
					<Breadcrumb.Item>
						<Breadcrumb.Link href="/projects/{project.id}">
							{project.name}
						</Breadcrumb.Link>
					</Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
		{/snippet}
		<ProjectContextUsage projectId={project.id} />
	</PageShell>
{:else}<p>This project is no longer available.</p>{/if}
