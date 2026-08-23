<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import type { DrawioStatus } from '../drawio-embed.svelte';

	/**
	 * What the draw.io embed is doing, said once.
	 *
	 * The embed pushes its chrome out to whoever hosts it, which left the same
	 * failed/busy/modified ladder copied into the studio pane, the draft pane and
	 * the review dialog — three places for one announcement to drift apart in.
	 *
	 * `idle` is the host's own line for when the embed has nothing to report; it is
	 * the only part that differs between hosts.
	 */
	let {
		status,
		onretry,
		idle
	}: {
		status: DrawioStatus;
		onretry?: () => void;
		idle?: Snippet;
	} = $props();

	const busy = $derived(status.phase === 'exporting' || status.phase === 'saving');
</script>

{#if status.phase === 'failed'}
	<p class="text-xs text-destructive" role="status" aria-live="polite">{status.failure}</p>
	{#if onretry}
		<Button variant="outline" size="sm" onclick={onretry}>Retry</Button>
	{/if}
{:else if busy}
	<p class="text-xs text-muted-foreground" role="status" aria-live="polite">Saving the diagram</p>
{:else if status.modified}
	<p class="text-xs text-muted-foreground" role="status" aria-live="polite">Unsaved changes</p>
{:else if idle}
	{@render idle()}
{/if}
