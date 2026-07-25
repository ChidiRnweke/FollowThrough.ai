<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import SettingsPolicies from '$lib/components/app/pages/settings-policies.svelte';
	import SettingsAgent from '$lib/components/app/pages/settings-agent.svelte';
	import { Separator } from '$lib/components/ui/separator';
	import AgentAction from '$lib/components/app/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/app/agent/agent-actions';

	let { data } = $props();
</script>

<PageShell title="Settings" description="Agent defaults and per-pipeline trust policies.">
	{#snippet actions()}
		<AgentAction action={agentActions.settings} />
	{/snippet}
	<section class="flex flex-col gap-4">
		<div>
			<h2 class="section-title">Agent</h2>
			<p class="text-sm text-muted-foreground">
				Choose the default model and how durable actions are approved.
			</p>
		</div>
		<SettingsAgent preferences={data.preferences} models={data.models} />
	</section>
	<Separator />
	<SettingsPolicies policies={data.policies} />
</PageShell>
