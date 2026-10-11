<script lang="ts">
	import { PieChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';

	let { used, total }: { used: number; total: number } = $props();

	const config: Chart.ChartConfig = {
		used: { label: 'Looked up', color: 'var(--brand)' },
		unused: { label: 'Not looked up yet', color: 'var(--muted)' }
	};
	const slices = $derived([
		{ part: 'used', value: used },
		{ part: 'unused', value: total - used }
	]);
	const share = $derived(total === 0 ? 0 : Math.round((used / total) * 100));
</script>

<!-- The ring is the picture; the number in its middle is the fact. -->
<div class="relative size-44 shrink-0 sm:size-52">
	<Chart.Container {config} class="aspect-square size-full">
		<PieChart
			data={slices}
			key="part"
			value="value"
			c="part"
			cRange={['var(--color-used)', 'var(--color-unused)']}
			innerRadius={0.74}
			cornerRadius={4}
			padAngle={0.02}
		/>
	</Chart.Container>
	<div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
		<span class="text-5xl font-semibold tracking-tight text-brand tabular-nums">{share}%</span>
		<span class="text-label text-muted-foreground">looked up</span>
	</div>
</div>
