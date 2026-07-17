<script lang="ts">
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
		disabled?: boolean;
		onchange: (next: number) => void;
	} = $props();

	const position = (of: number): number => ((of - min) / (max - min)) * 100;
</script>

<div class="flex flex-col gap-1">
	<div class="flex items-baseline justify-between gap-2">
		<span class="text-xs font-medium text-muted-foreground">{label}</span>
		<span class="text-xs text-muted-foreground">
			<span class="font-medium text-foreground">{format(value)}</span>
			· {describe(value)}
		</span>
	</div>
	<div class="relative pt-1">
		<input
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
		<div
			class="pointer-events-none absolute top-0 h-1.5 w-px bg-foreground/50"
			style="left: {position(defaultValue)}%"
		></div>
	</div>
	<div class="relative h-4 text-[10px] leading-4 text-muted-foreground">
		{#each anchors as anchor (anchor.value)}
			<span
				class="absolute -translate-x-1/2 whitespace-nowrap {anchor.value === defaultValue
					? 'font-medium text-foreground/80'
					: ''}"
				style="left: {position(anchor.value)}%"
			>
				{anchor.label}
			</span>
		{/each}
	</div>
</div>
