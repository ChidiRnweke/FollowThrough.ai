<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { AttachmentList } from '$lib/components/attachments';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { AgentAction, agentActions } from '$lib/components/agent';

	let { data } = $props();
	const project = $derived(data.session.resources.views.get('projects', data.projectId));

	const attachmentCount = $derived(
		data.session.resources.views.attachments({ kind: 'project', id: data.projectId }).length
	);
</script>

{#if project && !project.archivedAt}
	<PageShell
		title="Attachments"
		description="Files and images available to {project.name} and its agents."
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
		{#snippet actions()}
			{#if attachmentCount > 0}
				<AgentAction action={agentActions.projectAttachments} context={{ projectId: project.id }} />
			{/if}
		{/snippet}
		<AttachmentList owner={{ kind: 'project', id: project.id }} heroEmpty />
	</PageShell>
{:else}<p>This project is no longer available.</p>{/if}
