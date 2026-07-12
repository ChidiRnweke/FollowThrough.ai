<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import QuickCapture from '$lib/components/app/quick-capture.svelte';
	import TodayTriage from '$lib/components/app/pages/today-triage.svelte';

	let { data } = $props();
</script>

<PageShell title="Today" description="Triage first, then write.">
	<QuickCapture />
	<TodayTriage view={data.view} />
</PageShell>
