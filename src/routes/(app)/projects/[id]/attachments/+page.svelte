<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import AttachmentList from '$lib/components/attachments/attachment-list.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import AgentAction from '$lib/components/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/agent/agent-actions';

	let { data } = $props();

	// Nothing to read until something is uploaded, and DESIGN_SYSTEM.md is explicit
	// that a control for a value that is not set reads as noise.
	let reportedCount = $state<number>();
	const attachmentCount = $derived(reportedCount ?? data.attachments.length);
</script>

<PageShell
	title="Attachments"
	description="Files and images available to {data.project.name} and its agents."
>
	<!-- Ancestors only: the trailing crumb would restate the h1 directly beneath it. -->
	{#snippet breadcrumb()}
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/projects/{data.project.id}">
						{data.project.name}
					</Breadcrumb.Link>
				</Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
	{/snippet}
	{#snippet actions()}
		{#if attachmentCount > 0}
			<AgentAction
				action={agentActions.projectAttachments}
				context={{ projectId: data.project.id }}
			/>
		{/if}
	{/snippet}
	<AttachmentList
		projectId={data.project.id}
		initial={data.attachments}
		oncount={(count) => (reportedCount = count)}
		heroEmpty
	/>
</PageShell>
