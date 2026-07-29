<script lang="ts">
	import PageShell from '$lib/components/layout/page-shell.svelte';
	import ProfileMemory from '$lib/components/app/pages/profile-memory.svelte';
	import AgentAction from '$lib/components/app/agent/agent-action.svelte';
	import { agentActions } from '$lib/components/app/agent/agent-actions';
</script>

<PageShell>
	<!-- Custom header, the Today-page pattern: a voice line under the title gives
	     the page the identity the stock header lacked. -->
	{#snippet header()}
		<div class="flex flex-col gap-1">
			<h1 class="page-title">Profile</h1>
			<p class="text-sm text-muted-foreground">
				What the agent knows about you, and what it may propose remembering next.
			</p>
		</div>
	{/snippet}
	{#snippet actions()}
		<AgentAction action={agentActions.profile} />
	{/snippet}
	<ProfileMemory />
</PageShell>
