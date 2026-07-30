<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { untrack } from 'svelte';

	let {
		initialValue = '',
		onsubmit,
		oncancel,
		onadvance
	}: {
		initialValue?: string;
		/** Called with the trimmed value on Enter or blur. */
		onsubmit: (value: string) => void;
		oncancel: () => void;
		/** Called after Enter submits, to move the caret into the document body. */
		onadvance?: () => void;
	} = $props();

	// Seed once; the component remounts per edit session.
	let value = $state(untrack(() => initialValue));
	let settled = false;

	function submit(): void {
		if (settled) return;
		settled = true;
		onsubmit(value.trim());
	}

	function cancel(): void {
		if (settled) return;
		settled = true;
		oncancel();
	}

	function onkeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			submit();
			onadvance?.();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancel();
		}
	}
</script>

<!-- Borderless and breadcrumb-scale so committing does not change the utility row's height. -->
<Input
	class="min-w-0 flex-1 border-b border-b-primary bg-transparent text-sm text-foreground outline-none sm:w-64"
	placeholder="Untitled"
	aria-label="Note title"
	bind:value
	autofocus
	onfocus={(event) => event.currentTarget.select()}
	{onkeydown}
	onblur={submit}
/>
