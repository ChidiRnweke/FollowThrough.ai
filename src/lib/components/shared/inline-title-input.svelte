<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { untrack } from 'svelte';

	let {
		initialValue = '',
		label,
		onsubmit,
		oncancel,
		onadvance
	}: {
		initialValue?: string;
		label: string;
		onsubmit: (value: string) => void;
		oncancel: () => void;
		onadvance?: () => void;
	} = $props();

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

<Input
	class="min-w-0 flex-1 border-b border-b-primary bg-transparent text-sm text-foreground outline-none sm:w-64"
	placeholder="Untitled"
	aria-label={label}
	bind:value
	autofocus
	onfocus={(event) => event.currentTarget.select()}
	{onkeydown}
	onblur={submit}
/>
