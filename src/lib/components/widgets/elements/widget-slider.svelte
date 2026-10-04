<script lang="ts">
	import { getBoundProp, type BaseComponentProps } from '@json-render/svelte';
	import { Slider } from '$lib/components/ui/slider';

	let {
		props,
		bindings
	}: BaseComponentProps<{
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number | null;
		suffix?: string | null;
	}> = $props();

	const value = getBoundProp<number>(
		() => props.value,
		() => bindings?.value
	);
	const current = $derived(typeof value.current === 'number' ? value.current : props.min);
</script>

<div data-slot="widget-slider" class="flex min-w-48 flex-1 flex-col gap-2.5">
	<div class="flex items-baseline justify-between gap-3 text-label">
		<span class="text-muted-foreground">{props.label}</span>
		<span class="font-medium text-foreground tabular-nums">{current}{props.suffix ?? ''}</span>
	</div>
	<Slider
		type="single"
		value={current}
		min={props.min}
		max={props.max}
		step={props.step ?? 1}
		thumbLabel={props.label}
		onValueChange={(next) => (value.current = next)}
	/>
</div>
