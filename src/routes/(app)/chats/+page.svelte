<script lang="ts">
	import ChatHistoryPage from '$lib/components/app/pages/chat-history-page.svelte';
	let { data } = $props();
</script>

<ChatHistoryPage
	shell={data.shell}
	sessions={data.sessions}
	query={data.query}
	page={data.page}
	hasNext={data.hasNext}
/>
