<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import ProfileMemory from '$lib/components/app/pages/profile-memory.svelte';
	import AgentAction from '$lib/components/app/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/app/agent/agent-actions';
</script>

<PageShell
	title="Profile"
	description="What the agent knows about you across every project, and what it may propose remembering next."
>
	{#snippet actions()}
		<AgentAction action={agentActions.profile} />
	{/snippet}
	<ProfileMemory />
</PageShell>
