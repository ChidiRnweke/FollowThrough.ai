<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import MemoryEntryList from '$lib/components/app/memory-entry-list.svelte';
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
					<Breadcrumb.Item><Breadcrumb.Page>Memory</Breadcrumb.Page></Breadcrumb.Item>
				</Breadcrumb.List>
			</Breadcrumb.Root>
			<h1 class="text-xl font-semibold tracking-tight">Memory</h1>
			<p class="text-sm text-muted-foreground">
				Durable facts, decisions, constraints, and preferences for {data.project.name}.
			</p>
		</div>
	{/snippet}
	<MemoryEntryList
		projectId={data.project.id}
		placeholder="A fact, decision, constraint, or preference worth remembering…"
		emptyText="Nothing remembered yet. Add durable project facts here, or accept memory suggestions from the agent."
	/>
</PageShell>
