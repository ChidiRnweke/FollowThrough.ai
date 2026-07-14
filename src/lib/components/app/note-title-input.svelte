<script lang="ts">
	import { Input } from '$lib/components/ui/input';

	let {
		value = $bindable(),
		oninput,
		onadvance
	}: {
		value: string;
		oninput?: () => void;
		onadvance?: () => void;
	} = $props();

	function onkeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		onadvance?.();
	}
</script>

<Input
	class="note-title h-auto rounded-none border-0 border-b border-b-transparent bg-transparent px-0 py-2 shadow-none placeholder:text-muted-foreground/45 focus-visible:border-b-primary focus-visible:ring-0"
	placeholder="Untitled"
	aria-label="Note title"
	bind:value
	{oninput}
	{onkeydown}
/>
