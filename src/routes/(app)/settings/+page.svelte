<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import SettingsPolicies from '$lib/components/app/pages/settings-policies.svelte';
	import SettingsAgent from '$lib/components/app/pages/settings-agent.svelte';
	import { Separator } from '$lib/components/ui/separator';

	let { data } = $props();
</script>

<PageShell title="Settings" description="Agent defaults and per-pipeline trust policies.">
	<section class="flex flex-col gap-4">
		<div>
			<h2 class="text-sm font-semibold">Agent</h2>
			<p class="text-sm text-muted-foreground">
				Choose the default model and how durable actions are approved.
			</p>
		</div>
		<SettingsAgent preferences={data.preferences} models={data.models} />
	</section>
	<Separator />
	<SettingsPolicies policies={data.policies} />
</PageShell>
