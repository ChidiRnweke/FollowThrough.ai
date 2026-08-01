<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { Button } from '$lib/components/ui/button';
	import ToolApprovalCard from './tool-approval-card.svelte';

	let {
		tools,
		shell,
		busy = false,
		onapprove,
		onreject
	}: {
		tools: readonly ChatToolActivity[];
		shell?: ShellContext;
		busy?: boolean;
		onapprove: () => void;
		onreject: () => void;
	} = $props();

	// A single call keeps its own card exactly as before — the bundle is what changes, not
	// the ordinary case.
	const bundled = $derived(tools.length > 1);
</script>

{#if bundled}
	<div class="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
		<p class="px-1 text-xs font-medium text-muted-foreground">
			{tools.length} actions need approval
		</p>
		{#each tools as tool (tool.callId)}
			<ToolApprovalCard {tool} {shell} showFooter={false} {onapprove} {onreject} />
		{/each}
		<div class="flex gap-2 px-1 pb-1">
			<Button size="sm" disabled={busy} onclick={onapprove}>Approve all ({tools.length})</Button>
			<Button size="sm" variant="ghost" disabled={busy} onclick={onreject}>Reject all</Button>
		</div>
	</div>
{:else if tools[0]}
	<ToolApprovalCard tool={tools[0]} {shell} {busy} {onapprove} {onreject} />
{/if}
