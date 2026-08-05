<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import type { ExportSettings } from '$lib/models/deliverables';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import { FtChevronRight as ChevronRight } from '$lib/components/icons';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { diagramKeepsOwnColours } from '$lib/components/edra/mermaid-rendering';
	import { mermaidSourcesIn, renderDiagrams } from './render-diagrams';
	import ExportSettingsFields from './export-settings-fields.svelte';
	import {
		generateDocument,
		getExportSettings,
		previewDocument
	} from '$lib/remote/deliverables/deliverables.remote';

	let {
		open = $bindable(false),
		projectId,
		defaultTitle = '',
		defaultNoteIds = [],
		documents = []
	}: {
		open?: boolean;
		projectId: string;
		defaultTitle?: string;
		defaultNoteIds?: string[];
		documents?: readonly { id: string; document: unknown }[];
	} = $props();

	let title = $state('');
	let format = $state<'docx' | 'pdf'>('pdf');
	let settings = $state<ExportSettings>({ ...defaultExportSettings });
	let busy = $state(false);
	let previewOpen = $state(false);
	let previewUrl = $state('');
	let result = $state<{ url: string; artifactId: string } | null>(null);
	let error = $state('');

	$effect(() => {
		if (open) {
			title = defaultTitle;
			format = 'pdf';
			result = null;
			error = '';
			void loadSettings();
		} else {
			previewOpen = false;
			clearPreview();
		}
	});

	async function loadSettings(): Promise<void> {
		try {
			settings = { ...(await getExportSettings(projectId)) };
		} catch {
			settings = { ...defaultExportSettings };
		}
	}

	function clearPreview(): void {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = '';
	}

	// Colour controls only earn their space when there is a diagram to colour, and the
	// palette caveat only when a diagram ignores the palette.
	const mermaidSources = $derived(mermaidSourcesIn(documents));
	const hasDiagrams = $derived(mermaidSources.length > 0);
	const hasSelfStyledDiagrams = $derived(mermaidSources.some(diagramKeepsOwnColours));

	async function preview(): Promise<void> {
		const trimmed = title.trim();
		if (!trimmed) return;
		busy = true;
		error = '';
		try {
			const {
				svgs: diagramSvgs,
				pngs: diagramPngs,
				sizes: diagramSizes
			} = await renderDiagrams(mermaidSources, settings);
			const output = await previewDocument({
				projectId,
				noteIds: defaultNoteIds,
				title: trimmed,
				settings,
				diagramSvgs,
				diagramPngs,
				diagramSizes
			});
			const bytes = Uint8Array.from(atob(output.data), (character) => character.charCodeAt(0));
			clearPreview();
			previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
			previewOpen = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Preview failed';
		} finally {
			busy = false;
		}
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const trimmed = title.trim();
		if (!trimmed) return;
		busy = true;
		error = '';
		try {
			const {
				svgs: diagramSvgs,
				pngs: diagramPngs,
				sizes: diagramSizes
			} = await renderDiagrams(mermaidSources, settings);
			const output = await generateDocument({
				projectId,
				noteIds: defaultNoteIds,
				title: trimmed,
				format,
				settings,
				diagramSvgs,
				diagramPngs,
				diagramSizes
			});
			result = { url: output.downloadUrl, artifactId: output.artifact.id };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Export failed';
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Export Document</Dialog.Title>
			<Dialog.Description>
				Generate a DOCX or PDF from the selected note content.
			</Dialog.Description>
		</Dialog.Header>

		<Form class="flex flex-col gap-4" onsubmit={submit}>
			<Input bind:value={title} placeholder="Document title" aria-label="Title" disabled={busy} />

			<Label class="flex items-center gap-2 text-xs font-normal text-muted-foreground">
				<Checkbox
					checked={settings.includeTitle ?? false}
					onCheckedChange={(includeTitle) =>
						(settings = { ...settings, includeTitle: includeTitle === true })}
					disabled={busy}
					aria-label="Include file name as title"
				/>
				Include file name as title
			</Label>

			<div class="flex items-center gap-2">
				<Button
					type="button"
					variant={format === 'pdf' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (format = 'pdf')}
				>
					PDF
				</Button>
				<Button
					type="button"
					variant={format === 'docx' ? 'default' : 'outline'}
					size="sm"
					onclick={() => (format = 'docx')}
				>
					DOCX
				</Button>
			</div>

			<Collapsible.Root>
				<Collapsible.Trigger
					class="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					<ChevronRight class="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
					Advanced layout
				</Collapsible.Trigger>
				<Collapsible.Content class="pt-3">
					<ExportSettingsFields bind:settings {hasDiagrams} {hasSelfStyledDiagrams} />
					<p class="pt-2 text-xs text-muted-foreground">
						Applies to this export. Set project defaults from the project menu.
					</p>
				</Collapsible.Content>
			</Collapsible.Root>

			{#if result}
				<div class="flex flex-col items-center gap-2 rounded-md border p-3">
					<p class="text-sm font-medium">Document ready</p>
					<a href={result.url} download class="text-sm text-primary underline hover:no-underline">
						Download
					</a>
					<a
						href="/artifacts?projectId={projectId}"
						class="text-xs text-muted-foreground underline"
					>
						View in Artifacts
					</a>
				</div>
			{/if}

			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}

			<Dialog.Footer class="sm:flex-wrap sm:justify-end">
				<Button type="button" variant="ghost" onclick={() => (open = false)}>
					{result ? 'Close' : 'Cancel'}
				</Button>
				<Button
					type="button"
					variant="outline"
					disabled={busy || !title.trim()}
					onclick={() => void preview()}
				>
					{busy ? 'Working…' : 'Preview PDF'}
				</Button>
				{#if !result}
					<Button type="submit" disabled={busy || !title.trim()}>
						{busy ? 'Generating…' : 'Generate'}
					</Button>
				{/if}
			</Dialog.Footer>
		</Form>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={previewOpen}>
	<Dialog.Content class="flex h-5/6 flex-col sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>PDF Preview</Dialog.Title>
			<Dialog.Description>How the export will look with the current settings.</Dialog.Description>
		</Dialog.Header>
		{#if previewUrl}
			<iframe src={previewUrl} title="PDF preview" class="min-h-0 w-full flex-1 rounded-md border"
			></iframe>
		{/if}
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => (previewOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
