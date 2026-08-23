<script lang="ts">
	import InlineTitleInput from '$lib/components/shared/inline-title-input.svelte';

	let {
		initialValue = '',
		onsubmit,
		oncancel,
		onadvance
	}: {
		initialValue?: string;
		onsubmit: (value: string) => void;
		oncancel: () => void;
		onadvance?: () => void;
	} = $props();
</script>

<InlineTitleInput {initialValue} label="Note title" {onsubmit} {oncancel} {onadvance} />
