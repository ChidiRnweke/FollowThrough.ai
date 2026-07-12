<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import SettingsPolicies from '$lib/components/app/pages/settings-policies.svelte';

	let { data } = $props();
</script>

<PageShell title="Settings" description="Per-pipeline trust policies.">
	<SettingsPolicies policies={data.policies} />
</PageShell>
