<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import type { WithElementRef } from '$lib/utils';

	type Props = WithElementRef<HTMLFormAttributes> & {
		children?: Snippet;
	};

	let { ref = $bindable(null), children, ...restProps }: Props = $props();
</script>

<form bind:this={ref} data-slot="form" {...restProps}>
	{@render children?.()}
</form>
