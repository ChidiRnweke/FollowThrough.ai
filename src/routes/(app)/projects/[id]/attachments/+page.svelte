<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import AttachmentList from '$lib/components/app/attachment-list.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';

	let { data } = $props();
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
			<h1 class="text-xl font-semibold tracking-tight">Attachments</h1>
			<p class="text-sm text-muted-foreground">
				Files and images available to {data.project.name} and its agents.
			</p>
		</div>
	{/snippet}
	<AttachmentList projectId={data.project.id} />
</PageShell>
