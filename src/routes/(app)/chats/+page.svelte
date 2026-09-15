<script lang="ts">
	import { ChatHistoryPage } from '$lib/components/chat';
	let { data } = $props();
	const conversations = $derived(data.session.resources.views.conversations(data.query));
	const currentPage = $derived(
		Math.min(data.page, Math.max(1, Math.ceil(conversations.length / 25)))
	);
</script>

<ChatHistoryPage
	shell={data.session.shell}
	sessions={conversations.slice((currentPage - 1) * 25, currentPage * 25)}
	query={data.query}
	page={currentPage}
	hasNext={currentPage * 25 < conversations.length}
/>
