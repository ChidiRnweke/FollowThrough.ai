<!-- chisel-ignore-file structural:inline-style-banned -- Slider markers are positioned from caller-provided runtime ranges. -->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	let {
		label,
		value,
		min,
		max,
		step,
		defaultValue,
		anchors,
		describe,
		format = (current: number) => String(current),
		showLabel = true,
		disabled = false,
		onchange
	}: {
		label: string;
		value: number;
		min: number;
		max: number;
		step: number;
		defaultValue: number;
		/** Reference points along the axis that hint at the impact of a value. */
		anchors: readonly { value: number; label: string }[];
		/** Short description of how the current value is perceived. */
		describe: (current: number) => string;
		format?: (current: number) => string;
		/** Settings rows already name the setting on the left; there the label is noise. */
		showLabel?: boolean;
		disabled?: boolean;
		onchange: (next: number) => void;
	} = $props();

	const position = (of: number): number => ((of - min) / (max - min)) * 100;
	// Edge anchors sit flush with the track ends; interior anchors centre on their value.
	// Centring every label would let text width push the first and last past the track.
	const anchorAlign = (of: number): string =>
		of === min ? '' : of === max ? '-translate-x-full' : '-translate-x-1/2';
</script>

<div class="flex flex-col gap-1">
	<!-- min-h-8 reserves two text-xs lines so a wrapped summary never shifts the track. -->
	<div class="flex min-h-8 items-start gap-2 {showLabel ? 'justify-between' : 'justify-start'}">
		{#if showLabel}
			<span class="text-xs font-medium text-muted-foreground">{label}</span>
		{/if}
		<span class="text-xs leading-4 text-muted-foreground">
			<span class="font-medium text-foreground">{format(value)}</span>
			· {describe(value)}
		</span>
	</div>
	<div class="relative pt-1">
		<Input
			type="range"
			{min}
			{max}
			{step}
			{value}
			{disabled}
			aria-label={label}
			class="w-full accent-primary"
			oninput={(event) => onchange(Number(event.currentTarget.value))}
		/>
		<!-- Default marker sits above the axis labels. -->
		<!-- chisel-ignore structural:inline-style-banned -- Slider marker position is computed from its runtime range. -->
		<div
			class="pointer-events-none absolute top-0 h-1.5 w-px bg-foreground/50"
			style="left: {position(defaultValue)}%"
		></div>
	</div>
	<div class="relative h-4 text-xs leading-4 text-muted-foreground">
		{#each anchors as anchor (anchor.value)}
			<!-- chisel-ignore structural:inline-style-banned -- Slider label position is computed from its runtime range. -->
			<span
				class="absolute whitespace-nowrap {anchorAlign(anchor.value)} {anchor.value === defaultValue
					? 'font-medium text-foreground/80'
					: ''}"
				style="left: {position(anchor.value)}%"
			>
				{anchor.label}
			</span>
		{/each}
	</div>
</div>
