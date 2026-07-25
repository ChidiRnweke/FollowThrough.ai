<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import ProfileMemory from '$lib/components/app/pages/profile-memory.svelte';
	import AgentAction from '$lib/components/app/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/app/agent/agent-actions';
</script>

<PageShell
	title="Profile"
	description="What the agent knows about you across every project — who you are, what you're working toward, and how you like to work. The agent proposes additions as it gets to know you; you decide what sticks."
>
	{#snippet actions()}
		<AgentAction action={agentActions.profile} />
	{/snippet}
	<ProfileMemory />
</PageShell>
