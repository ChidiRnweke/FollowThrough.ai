<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import SuggestionsInbox from '$lib/components/app/pages/suggestions-inbox.svelte';

	let { data } = $props();
</script>

<PageShell
	title="Suggestions"
	description="Everything the AI proposed, grouped by note, oldest first."
>
	<SuggestionsInbox groups={data.groups} />
</PageShell>
