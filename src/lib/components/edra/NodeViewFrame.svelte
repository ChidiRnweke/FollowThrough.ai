<script lang="ts">
	import { setContext, type Component as SvelteComponent } from 'svelte';

	let {
		component: Component,
		onDragStart,
		decorationClasses,
		...props
	}: {
		component: SvelteComponent;
		onDragStart: (event: DragEvent) => void;
		decorationClasses: string;
		[key: string]: unknown;
	} = $props();

	// svelte-ignore state_referenced_locally
	setContext('onDragStart', onDragStart);
	// svelte-ignore state_referenced_locally
	setContext('decorationClasses', decorationClasses);
</script>

<Component {...props} />
