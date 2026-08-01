<script lang="ts">
	import ChatWorkspace from '$lib/components/chat/workspace/chat-workspace.svelte';
	let { data } = $props();
</script>

<ChatWorkspace
	shell={data.shell}
	sessions={data.sessions}
	agentPreferences={data.agentPreferences}
	agentModels={data.agentModels}
	agentAvailable={data.agentAvailable}
/>
