<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import * as Dialog from '$lib/components/ui/dialog';
	import ToolRow from './tool-row.svelte';

	let {
		open = $bindable(false),
		tools,
		shell
	}: {
		open?: boolean;
		tools: readonly ChatToolActivity[];
		shell?: ShellContext;
	} = $props();
</script>

<!--
	The log, behind one door for the whole turn instead of one per call. Everything the
	transcript leaves out is here in call order — the tool searches, the attempts that were
	retried, the arguments and the results — because a reader who opens this has asked for
	exactly that.
-->
<Dialog.Root bind:open>
	<Dialog.Content class="dialog-fill flex flex-col sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>What the agent did</Dialog.Title>
			<Dialog.Description>
				{tools.length === 1 ? '1 step' : `${tools.length} steps`}, in the order they ran.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
			{#each tools as tool, index (tool.callId || index)}
				<ToolRow {tool} {shell} />
			{/each}
		</div>
	</Dialog.Content>
</Dialog.Root>
