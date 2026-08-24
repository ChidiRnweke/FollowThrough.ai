<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace';
	import type { FailedToolActivity } from '$lib/stores/agent/chat-tools';
	import { Button } from '$lib/components/ui/button';
	import { FtWarning } from '$lib/components/icons';
	import { explainToolFailure, toolStatusParts } from '$lib/components/agent';

	let {
		tool,
		shell,
		retryable = false,
		onretry
	}: {
		/** The call that failed. A bare message cannot say what it failed on. */
		tool: FailedToolActivity;
		shell?: ShellContext;
		retryable?: boolean;
		onretry?: () => void;
	} = $props();

	const parts = $derived(toolStatusParts(tool, shell));
	const cause = $derived(explainToolFailure(tool.failure));
</script>

<!--
	A failure is three things, and the transcript used to carry only the first: what failed,
	why in the reader's terms, and what they can do about it. The raw message the run produced
	lives in the steps row underneath — it is evidence, not the message.

	Flat and inline, like everything else here: the icon and the destructive subject are the
	whole signal, and a box around it would be the fourth edge in a panel that has none.
-->
<div class="flex gap-2 text-xs" role="alert">
	<FtWarning class="mt-0.5 size-3.5 shrink-0 text-destructive" />
	<div class="flex min-w-0 flex-col gap-1">
		<p class="text-destructive">
			{parts.label}{parts.subject ? ` · ${parts.subject}` : ''}
		</p>
		{#if cause}
			<p class="text-muted-foreground">{cause}</p>
		{/if}
		{#if retryable && onretry}
			<Button variant="outline" size="xs" class="mt-1 self-start" onclick={onretry}>
				Try again
			</Button>
		{/if}
	</div>
</div>
