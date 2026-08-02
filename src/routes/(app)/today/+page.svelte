<script lang="ts">
	import { page } from '$app/state';
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import { QuickCapture } from '$lib/components/shell';
	import { TodayTriage } from '$lib/components/today';
	import { AgentAction, agentActions } from '$lib/components/agent';

	let { data } = $props();

	const now = new Date();
	const dateLine = `${now.toLocaleDateString('en-GB', { weekday: 'long' })} · ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`;
	const hour = now.getHours();
	const voiceLine =
		hour < 12
			? 'Morning. Triage first, then write.'
			: hour < 18
				? 'Afternoon. Finish one thing well.'
				: 'Evening. Tie off the loose ends.';
</script>

<PageShell>
	{#snippet header()}
		<div class="flex flex-col gap-1">
			<p class="eyebrow">{dateLine}</p>
			<h1 class="page-title">Today</h1>
			<p class="text-sm text-muted-foreground">{voiceLine}</p>
		</div>
	{/snippet}
	{#snippet actions()}
		<AgentAction action={agentActions.today} />
	{/snippet}
	<QuickCapture focusOnMount={page.url.searchParams.has('quickCapture')} />
	<TodayTriage view={data.view} projects={data.shell.projects} />
</PageShell>
