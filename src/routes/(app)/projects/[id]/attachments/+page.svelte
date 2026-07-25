<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import AttachmentList from '$lib/components/app/attachment-list.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import AgentAction from '$lib/components/app/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/app/agent/agent-actions';

	let { data } = $props();

	// Nothing to read until something is uploaded, and DESIGN_SYSTEM.md is explicit
	// that a control for a value that is not set reads as noise.
	let attachmentCount = $state(0);
</script>

<PageShell>
	{#snippet header()}
		<div class="flex flex-col gap-1">
			<Breadcrumb.Root>
				<Breadcrumb.List>
					<Breadcrumb.Item
						><Breadcrumb.Link href="/projects/{data.project.id}"
							>{data.project.name}</Breadcrumb.Link
						></Breadcrumb.Item
					>
					<Breadcrumb.Separator />
					<Breadcrumb.Item><Breadcrumb.Page>Attachments</Breadcrumb.Page></Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
			<h1 class="page-title">Attachments</h1>
			<p class="text-sm text-muted-foreground">
				Files and images available to {data.project.name} and its agents.
			</p>
		</div>
	{/snippet}
	{#snippet actions()}
		{#if attachmentCount > 0}
			<AgentAction
				action={agentActions.projectAttachments}
				context={{ projectId: data.project.id }}
			/>
		{/if}
	{/snippet}
	<AttachmentList projectId={data.project.id} oncount={(count) => (attachmentCount = count)} />
</PageShell>
