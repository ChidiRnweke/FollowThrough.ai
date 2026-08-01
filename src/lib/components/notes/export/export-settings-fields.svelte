<script lang="ts">
	import type { ExportSettings } from '$lib/models/deliverables';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import * as Select from '$lib/components/ui/select';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import ExportSlider from './export-slider.svelte';
	import {
		MERMAID_PALETTE_KEYS,
		MERMAID_PALETTE_LABELS,
		mermaidTokensFor
	} from '$lib/components/edra/mermaid-rendering';

	let {
		settings = $bindable(),
		disabled = false,
		hasDiagrams = false,
		hasSelfStyledDiagrams = false
	}: {
		settings: ExportSettings;
		disabled?: boolean;
		/** Colour controls are noise on an export with no diagram in it. */
		hasDiagrams?: boolean;
		/** The palette caveat is only worth stating when a diagram ignores the palette. */
		hasSelfStyledDiagrams?: boolean;
	} = $props();

	const diagramBase = $derived(settings.diagramTheme?.base ?? 'light');
	const diagramPreset = $derived(mermaidTokensFor({ base: diagramBase }));

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

	<!-- Diagrams follow the document, not the reader's colour mode: an exported file is
	     read somewhere we do not control, and dark strokes on a dark fill are unreadable
	     on paper. Only rendered when the export actually contains a diagram. -->
	{#if hasDiagrams}
		<div class="flex flex-col gap-2">
			<Label class="text-xs text-muted-foreground">Diagram colours</Label>
			<ToggleGroup.Root
				type="single"
				value={diagramBase}
				{disabled}
				onValueChange={(next) => {
					if (next)
						settings = {
							...settings,
							diagramTheme: { ...settings.diagramTheme, base: next as 'light' | 'dark' }
						};
				}}
				class="max-w-48"
			>
				<ToggleGroup.Item value="light" class="flex-1">Light</ToggleGroup.Item>
				<ToggleGroup.Item value="dark" class="flex-1">Dark</ToggleGroup.Item>
			</ToggleGroup.Root>
			<div class="grid max-w-md grid-cols-2 gap-x-2 gap-y-1.5">
				{#each MERMAID_PALETTE_KEYS as key (key)}
					<Label class="flex items-center gap-2 text-xs font-normal text-muted-foreground">
						<Input
							type="color"
							class="size-5 shrink-0 cursor-pointer rounded-sm border border-border bg-transparent"
							value={settings.diagramTheme?.colors?.[key] ?? diagramPreset[key]}
							aria-label={MERMAID_PALETTE_LABELS[key]}
							{disabled}
							oninput={(event) => {
								settings = {
									...settings,
									diagramTheme: {
										base: diagramBase,
										colors: {
											...settings.diagramTheme?.colors,
											[key]: event.currentTarget.value
										}
									}
								};
							}}
						/>
						{MERMAID_PALETTE_LABELS[key]}
					</Label>
				{/each}
			</div>
			{#if hasSelfStyledDiagrams}
				<p class="text-xs text-muted-foreground">
					A diagram with its own <code>style</code> or <code>classDef</code> keeps those colours.
				</p>
			{/if}
			{#if settings.diagramTheme?.colors}
				<Button
					variant="ghost"
					size="sm"
					class="self-start"
					{disabled}
					onclick={() => (settings = { ...settings, diagramTheme: { base: diagramBase } })}
				>
					Reset to {diagramBase}
				</Button>
			{/if}
		</div>
	{/if}
</div>
