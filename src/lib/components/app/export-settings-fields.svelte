<script lang="ts">
	import type { ExportSettings } from '$lib/models';
	import { defaultExportSettings } from '$lib/models';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import ExportSlider from './export-slider.svelte';

	let {
		settings = $bindable(),
		disabled = false
	}: {
		settings: ExportSettings;
		disabled?: boolean;
	} = $props();

	const fontFamilyLabels: Record<ExportSettings['fontFamily'], string> = {
		helvetica: 'Helvetica',
		times: 'Times',
		courier: 'Courier'
	};

	const describeFontSize = (size: number): string => {
		if (size < 9.5) return 'fine print';
		if (size < 10.5) return 'compact reports';
		if (size <= 12) return 'standard document text';
		if (size <= 14) return 'comfortable reading';
		return 'presentation-sized';
	};

	const describeLineHeight = (height: number): string => {
		if (height < 1.2) return 'dense, fits the most per page';
		if (height < 1.5) return 'balanced spacing';
		if (height < 1.8) return 'relaxed, easy to scan';
		return 'airy, lots of breathing room';
	};

	const describeMargin = (margin: number): string => {
		if (margin < 45) return 'edge to edge';
		if (margin < 90) return 'classic document frame';
		return 'wide, formal whitespace';
	};
</script>

<div class="flex flex-col gap-4">
	<Label class="flex max-w-48 flex-col items-start gap-1 text-xs text-muted-foreground">
		Font
		<Select.Root
			type="single"
			value={settings.fontFamily}
			onValueChange={(value) =>
				(settings = { ...settings, fontFamily: value as ExportSettings['fontFamily'] })}
		>
			<Select.Trigger size="sm" class="w-full" aria-label="Font family" {disabled}>
				{fontFamilyLabels[settings.fontFamily]}
			</Select.Trigger>
			<Select.Content>
				{#each Object.entries(fontFamilyLabels) as [value, label] (value)}
					<Select.Item {value} {label} />
				{/each}
			</Select.Content>
		</Select.Root>
	</Label>

	<ExportSlider
		label="Font size"
		value={settings.fontSize}
		min={8}
		max={18}
		step={0.5}
		defaultValue={defaultExportSettings.fontSize}
		anchors={[
			{ value: 9, label: 'Compact' },
			{ value: 11, label: 'Standard' },
			{ value: 14, label: 'Large' },
			{ value: 17, label: 'Slides' }
		]}
		describe={describeFontSize}
		format={(size) => `${size} pt`}
		{disabled}
		onchange={(fontSize) => (settings = { ...settings, fontSize })}
	/>

	<ExportSlider
		label="Line height"
		value={settings.lineHeight}
		min={1}
		max={2.2}
		step={0.05}
		defaultValue={defaultExportSettings.lineHeight}
		anchors={[
			{ value: 1.1, label: 'Tight' },
			{ value: 1.35, label: 'Balanced' },
			{ value: 1.8, label: 'Airy' }
		]}
		describe={describeLineHeight}
		format={(height) => `×${height}`}
		{disabled}
		onchange={(lineHeight) => (settings = { ...settings, lineHeight })}
	/>

	<ExportSlider
		label="Page margin"
		value={settings.margin}
		min={18}
		max={144}
		step={6}
		defaultValue={defaultExportSettings.margin}
		anchors={[
			{ value: 30, label: 'Narrow' },
			{ value: 72, label: 'Classic' },
			{ value: 120, label: 'Wide' }
		]}
		describe={describeMargin}
		format={(margin) => `${margin} pt`}
		{disabled}
		onchange={(margin) => (settings = { ...settings, margin })}
	/>
</div>
