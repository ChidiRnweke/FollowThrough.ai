<script lang="ts">
	import type { Component } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { FtClose as X } from '$lib/components/icons';

	/**
	 * The row an AI action becomes while it runs: its icon, what it is doing, the
	 * thinking dots, and the cross that stops it.
	 *
	 * It takes the place of the controls that started the action, in the same box
	 * at the same place — the answer to "did my click land?" belongs where the click
	 * happened, and so does the way to take it back.
	 */
	let {
		icon: Icon,
		label,
		cancelling = false,
		oncancel,
		class: className = ''
	}: {
		icon: Component<{ class?: string }>;
		label: string;
		/** Set once cancellation is requested but the run has not settled yet. */
		cancelling?: boolean;
		/** Omitted for work that cannot be stopped, which hides the cross entirely. */
		oncancel?: () => void;
		class?: string;
	} = $props();
</script>

<div
	class="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground {className}"
	role="status"
	aria-live="polite"
>
	<Icon class="size-4" />
	{cancelling ? 'Stopping…' : label}
	{#if !cancelling}
		<span class="chat-thinking-dots" aria-hidden="true">
			<span></span><span></span><span></span>
		</span>
	{/if}
	{#if oncancel}
		<Button
			variant="ghost"
			size="icon-xs"
			aria-label={cancelling ? 'Stopping' : `Cancel ${label.toLowerCase()}`}
			disabled={cancelling}
			onclick={oncancel}
		>
			<X />
		</Button>
	{/if}
</div>
