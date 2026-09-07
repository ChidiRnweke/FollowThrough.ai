<script lang="ts">
	import type { AgentPreferenceValues } from '$lib/models/agent';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { Button } from '$lib/components/ui/button';
	import ToolApprovalCard from './tool-approval-card.svelte';

	let {
		tools,
		shell,
		preferences,
		busy = false,
		onapprove,
		onreject
	}: {
		tools: readonly ChatToolActivity[];
		shell?: ShellContext;
		preferences?: AgentPreferenceValues;
		busy?: boolean;
		onapprove: () => void;
		onreject: () => void;
	} = $props();

	// A single call keeps its own card exactly as before — the bundle is what changes, not
	// the ordinary case.
	const bundled = $derived(tools.length > 1);
</script>

{#if bundled}
	<!--
		Spacing holds the bundle together, not a tray: a bordered box around bordered cards was
		the nested-rectangle failure the surface rule exists to prevent. 24px between the
		changes, because each is a different thing to weigh, and one action row answering all.
	-->
	<div class="my-2 flex flex-col gap-6 border-y border-brand/40 py-4">
		<p class="text-xs font-medium text-muted-foreground">
			{tools.length} changes need your approval
		</p>
		{#each tools as tool (tool.callId)}
			<ToolApprovalCard
				{tool}
				{shell}
				{preferences}
				showFooter={false}
				framed={false}
				{onapprove}
				{onreject}
			/>
		{/each}
		<div class="flex gap-2">
			<Button size="sm" disabled={busy} onclick={onapprove}>Approve all ({tools.length})</Button>
			<Button size="sm" variant="ghost" disabled={busy} onclick={onreject}>Reject all</Button>
		</div>
	</div>
{:else if tools[0]}
	<ToolApprovalCard tool={tools[0]} {shell} {preferences} {busy} {onapprove} {onreject} />
{/if}
