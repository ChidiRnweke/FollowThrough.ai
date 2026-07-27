<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Popover from '$lib/components/ui/popover';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { FtDownload as Download } from '$lib/components/icons';
	import {
		MERMAID_PALETTE_KEYS,
		MERMAID_PALETTE_LABELS,
		diagramKeepsOwnColours,
		mermaidTokensFor,
		type MermaidPalette,
		type MermaidTheme
	} from './mermaid-rendering.js';
	import { exportMermaidDiagram, type MermaidExportFormat } from './mermaid-export.js';

	let { source, fileName = 'diagram' }: { source: string; fileName?: string } = $props();

	// Export settings are a property of the export, not of the diagram: a reader choosing
	// light output for a report has not changed how the diagram reads in the editor.
	let base = $state<'light' | 'dark'>('light');
	let transparent = $state(false);
	let format = $state<MermaidExportFormat>('png');
	let palette = $state<MermaidPalette>({});
	let busy = $state(false);
	let open = $state(false);

	const preset = $derived(mermaidTokensFor({ base }));
	const theme = $derived<MermaidTheme>({ base, palette, transparent });
	const customised = $derived(Object.keys(palette).length > 0);

	async function run(): Promise<void> {
		busy = true;
		try {
			await exportMermaidDiagram({ source, theme, format, fileName });
			open = false;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'The diagram could not be exported.');
		} finally {
			busy = false;
		}
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} size="icon-sm" variant="ghost" aria-label="Export diagram">
				<Download class="text-muted-foreground" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-72" align="end">
		<div class="flex flex-col gap-6">
			<div class="flex flex-col gap-2">
				<Label>Palette</Label>
				<ToggleGroup.Root
					type="single"
					value={base}
					onValueChange={(next) => {
						if (next) base = next as 'light' | 'dark';
					}}
					class="w-full"
				>
					<ToggleGroup.Item value="light" class="flex-1">Light</ToggleGroup.Item>
					<ToggleGroup.Item value="dark" class="flex-1">Dark</ToggleGroup.Item>
				</ToggleGroup.Root>
				<!-- Stated only when it applies: a diagram that styles itself keeps its own
				     colours whatever is chosen here, and mermaid gives us no way to override that. -->
				{#if diagramKeepsOwnColours(source)}
					<p class="text-xs text-muted-foreground">
						A diagram with its own <code>style</code> or <code>classDef</code> keeps those colours.
					</p>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				<Label>Colours</Label>
				<div class="grid grid-cols-2 gap-x-2 gap-y-1.5">
					{#each MERMAID_PALETTE_KEYS as key (key)}
						<Label class="flex items-center gap-2 text-xs font-normal text-muted-foreground">
							<input
								type="color"
								class="size-5 shrink-0 cursor-pointer rounded-sm border border-border bg-transparent"
								value={palette[key] ?? preset[key]}
								aria-label={MERMAID_PALETTE_LABELS[key]}
								oninput={(event) => {
									palette = { ...palette, [key]: event.currentTarget.value };
								}}
							/>
							{MERMAID_PALETTE_LABELS[key]}
						</Label>
					{/each}
				</div>
				{#if customised}
					<Button variant="ghost" size="sm" class="self-start" onclick={() => (palette = {})}>
						Reset to {base}
					</Button>
				{/if}
			</div>

			<div class="flex flex-col gap-2">
				<Label>Output</Label>
				<ToggleGroup.Root
					type="single"
					value={format}
					onValueChange={(next) => {
						if (next) format = next as MermaidExportFormat;
					}}
					class="w-full"
				>
					<ToggleGroup.Item value="png" class="flex-1">PNG</ToggleGroup.Item>
					<ToggleGroup.Item value="svg" class="flex-1">SVG</ToggleGroup.Item>
				</ToggleGroup.Root>
				<Label class="flex items-center gap-2 text-xs font-normal text-muted-foreground">
					<Checkbox
						checked={transparent}
						aria-label="Transparent background"
						onCheckedChange={(checked) => (transparent = checked === true)}
					/>
					Transparent background
				</Label>
			</div>

			<Button size="sm" disabled={busy} onclick={run}>
				{busy ? 'Exporting…' : 'Export diagram'}
			</Button>
		</div>
	</Popover.Content>
</Popover.Root>
