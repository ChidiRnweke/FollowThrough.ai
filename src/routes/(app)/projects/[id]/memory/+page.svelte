<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { MemoryEntryList } from '$lib/components/memory';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { AgentAction, agentActions } from '$lib/components/agent';

	let { data } = $props();
</script>

<PageShell
	title="Memory"
	description="Durable facts, decisions, constraints, and preferences for {data.project.name}."
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
		<AgentAction action={agentActions.projectDistil} context={{ projectId: data.project.id }} />
	{/snippet}
	<MemoryEntryList
		projectId={data.project.id}
		placeholder="A fact, decision, constraint, or preference worth remembering…"
		emptyText="Nothing remembered here yet."
		emptyHint="Add a durable project fact, or accept a memory suggestion from the agent."
		heroEmpty
	/>
</PageShell>
