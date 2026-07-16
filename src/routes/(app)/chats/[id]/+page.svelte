<script lang="ts">
	import ChatWorkspace from '$lib/components/app/pages/chat-workspace.svelte';
	let { data } = $props();
</script>

<ChatWorkspace
	shell={data.shell}
	sessions={data.sessions}
	conversation={data.conversation}
	agentPreferences={data.agentPreferences}
	agentModels={data.agentModels}
	agentAvailable={data.agentAvailable}
/>
