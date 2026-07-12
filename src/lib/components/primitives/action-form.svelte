<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { Snippet } from 'svelte';

	let {
		action,
		class: className,
		onsubmit,
		children
	}: {
		action: string;
		class?: string;
		onsubmit?: SubmitFunction;
		children: Snippet;
	} = $props();
</script>

<form method="POST" {action} class={className} use:enhance={onsubmit}>
	{@render children()}
</form>
