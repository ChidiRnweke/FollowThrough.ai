<script lang="ts">
	import { workspaceViews } from '$lib/factories/workspace/session';
	import { ChatHistoryPage } from '$lib/components/chat';
	let { data } = $props();
	const conversations = $derived(workspaceViews.conversations(data.query));
	const currentPage = $derived(
		Math.min(data.page, Math.max(1, Math.ceil(conversations.length / 25)))
	);
</script>

<ChatHistoryPage
	shell={workspaceViews.currentShell}
	sessions={conversations.slice((currentPage - 1) * 25, currentPage * 25)}
	query={data.query}
	page={currentPage}
	hasNext={currentPage * 25 < conversations.length}
/>
