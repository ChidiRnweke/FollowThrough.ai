<script lang="ts">
	import { untrack, type Component } from 'svelte';

	let {
		icon: Icon,
		placeholder = 'Name…',
		initialValue = '',
		busy = false,
		onsubmit,
		oncancel
	}: {
		icon?: Component;
		placeholder?: string;
		initialValue?: string;
		busy?: boolean;
		onsubmit: (value: string) => void | Promise<void>;
		oncancel: () => void;
	} = $props();

	// Seed once; the component remounts per edit target.
	let value = $state(untrack(() => initialValue));
	let submitted = false;

	function submit(): void {
		const trimmed = value.trim();
		if (!trimmed || busy) return;
		submitted = true;
		void onsubmit(trimmed);
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			submit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		}
	}

	function onblur(): void {
		if (!submitted && !busy) oncancel();
	}

	function autofocus(node: HTMLInputElement): void {
		node.focus();
		node.select();
	}
</script>

<div
	class="flex h-7 min-w-0 items-center gap-2 rounded-md border border-sidebar-ring/50 bg-background px-2"
>
	{#if Icon}
		<Icon class="size-4 shrink-0 text-muted-foreground" />
	{/if}
	<input
		class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
		{placeholder}
		aria-label={placeholder}
		disabled={busy}
		bind:value
		use:autofocus
		{onkeydown}
		{onblur}
	/>
</div>
