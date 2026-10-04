<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';
	import { Progress } from '$lib/components/ui/progress';

	let { props }: BaseComponentProps<{ label?: string | null; value: number; max: number }> =
		$props();

	// The bar never overflows its track, even when the data says more is done than planned.
	const value = $derived(Math.min(Math.max(props.value, 0), props.max));
</script>

<div data-slot="widget-progress" class="flex flex-col gap-1.5">
	{#if props.label}
		<div class="flex items-baseline justify-between text-label text-muted-foreground">
			<span>{props.label}</span>
			<span class="tabular-nums">{props.value} / {props.max}</span>
		</div>
	{/if}
	<Progress {value} max={props.max} class="h-1.5" aria-label={props.label ?? 'Progress'} />
</div>
