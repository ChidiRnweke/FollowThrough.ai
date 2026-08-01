<script lang="ts">
	import { Slider } from '$lib/components/ui/slider';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	interface SliderAnchor {
		readonly value: number;
		readonly label: string;
	}

	let {
		name,
		label,
		min,
		max,
		defaultValue,
		value = $bindable(null),
		anchors
	}: {
		name: string;
		label: string;
		min: number;
		max: number;
		defaultValue: number;
		value: number | null;
		anchors: readonly SliderAnchor[];
	} = $props();

	// Unset means "follow the deployment default", but a slider always needs a
	// position — so it rests on the default until the user drags it, and Reset
	// hands the setting back rather than pinning today's number.
	const position = $derived(value ?? defaultValue);
	const percentOf = (point: number): number => ((point - min) / (max - min)) * 100;
	// The end anchors hug the edges of the track; anything between them centres
	// on its tick so the label cannot overflow the control.
	const anchorStyle = (point: number): string =>
		point === min
			? 'left: 0%'
			: point === max
				? 'left: 100%; transform: translateX(-100%)'
				: `left: ${percentOf(point)}%; transform: translateX(-50%)`;
</script>

<div class="flex w-64 max-w-full flex-col">
	<div class="flex items-start gap-3">
		<div class="flex grow flex-col gap-1">
			<div class="relative">
				<Slider
					{min}
					{max}
					step={1}
					value={position}
					onValueChange={(next) => (value = next)}
					aria-label={label}
				/>
				<!-- The notch is taller than the track on purpose: it stays visible
				     whether it lands on the muted track or the filled range. -->
				<span
					class="pointer-events-none absolute top-1/2 h-[18px] w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40"
					style:left="{percentOf(defaultValue)}%"
				></span>
			</div>
			<div class="relative h-4">
				{#each anchors as anchor (anchor.value)}
					<span
						class="absolute text-xs leading-4 whitespace-nowrap {anchor.value === defaultValue
							? 'font-medium text-foreground'
							: 'text-muted-foreground'}"
						style={anchorStyle(anchor.value)}>{anchor.value} · {anchor.label}</span
					>
				{/each}
			</div>
		</div>
		<span
			class="w-20 shrink-0 pt-0.5 text-right text-sm tabular-nums {value === null
				? 'text-muted-foreground'
				: ''}">{value ?? `Default (${defaultValue})`}</span
		>
	</div>
	{#if value !== null}
		<Button
			type="button"
			variant="link"
			size="sm"
			class="h-auto self-end px-0 text-xs"
			onclick={() => (value = null)}>Reset to default</Button
		>
	{/if}
	<!-- Same contract as the number inputs this replaces: empty means "clear it",
	     which the remote schema turns into a null. -->
	<Input type="hidden" {name} value={value?.toString() ?? ''} />
</div>
