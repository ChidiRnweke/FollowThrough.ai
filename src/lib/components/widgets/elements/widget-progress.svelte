<script lang="ts">
	import type { BaseComponentProps } from '@json-render/svelte';

	let { props }: BaseComponentProps<{ label?: string | null; value: number; max: number }> =
		$props();

	const ratio = $derived(props.max > 0 ? Math.min(Math.max(props.value / props.max, 0), 1) : 0);
</script>

<div data-slot="widget-progress" class="flex flex-col gap-1.5">
	{#if props.label}
		<div class="flex items-baseline justify-between text-label text-muted-foreground">
			<span>{props.label}</span>
			<span class="tabular-nums">{props.value} / {props.max}</span>
		</div>
	{/if}
	<div
		class="h-1.5 overflow-hidden rounded-full bg-muted"
		role="progressbar"
		aria-valuemin={0}
		aria-valuemax={props.max}
		aria-valuenow={props.value}
		aria-label={props.label ?? 'Progress'}
	>
		<div class="h-full rounded-full bg-primary" style:width={`${ratio * 100}%`}></div>
	</div>
</div>
