<script lang="ts">
	import { PieChart } from 'layerchart';
	import * as Chart from '$lib/components/ui/chart';

	let { read, total }: { read: number; total: number } = $props();

	// Teal is what the agent read; the light end of the same ramp is what it has not.
	const config: Chart.ChartConfig = {
		read: { label: 'Read', color: Chart.seriesColor(0) },
		unread: { label: 'Not read yet', color: Chart.remainderColor }
	};
	const slices = $derived([
		{ part: 'read', value: read },
		{ part: 'unread', value: total - read }
	]);
	const share = $derived(total === 0 ? 0 : Math.round((read / total) * 100));
</script>

<div class="relative size-36 shrink-0">
	<Chart.Container {config} class="aspect-square size-full">
		<PieChart
			data={slices}
			key="part"
			value="value"
			c="part"
			cRange={['var(--color-read)', 'var(--color-unread)']}
			innerRadius={0.72}
			cornerRadius={3}
			padAngle={0.02}
		/>
	</Chart.Container>
	<span class="stat-value pointer-events-none absolute inset-0 flex items-center justify-center"
		>{share}%</span
	>
</div>
