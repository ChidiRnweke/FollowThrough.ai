<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace';
	import { toolFailure, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import type { ToolDisclosure } from '$lib/components/agent';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import RecordFields from './record-fields.svelte';
	import FileOutput from './file-output.svelte';
	let {
		disclosure,
		tool
	}: { disclosure: ToolDisclosure; tool: ChatToolActivity; shell?: ShellContext } = $props();
</script>

<div class="flex flex-col gap-2 text-xs text-muted-foreground">
	<ErrorBoundary label="this step" class="my-0">
		{#if disclosure.kind === 'failure'}<p class="break-words px-2">
				{toolFailure(tool) ?? disclosure.explanation}
			</p>
		{:else if disclosure.kind === 'file-output'}<FileOutput lines={disclosure.lines} />
		{:else if disclosure.kind === 'record'}<RecordFields changed={disclosure.changed} />{/if}
	</ErrorBoundary>
</div>
