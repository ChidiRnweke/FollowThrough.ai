<script lang="ts" module>
	/** A note offered for export, with the path it takes inside the zip. */
	export interface BulkExportEntry {
		readonly id: string;
		readonly title: string;
		/** Folder-relative and extension-less, e.g. `Interviews/Round two`. */
		readonly path: string;
		/** Folders below the exported one, for the picker's indentation. */
		readonly depth: number;
	}
</script>

<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import type { ExportSettings } from '$lib/models/deliverables';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import type { NoteDocument } from '$lib/models/notes';
	import { FtChevronRight as ChevronRight } from '$lib/components/icons';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { SvelteSet } from 'svelte/reactivity';
	import { diagramKeepsOwnColours } from '$lib/components/edra/mermaid-rendering';
	import { mermaidSourcesIn, renderDiagrams } from './render-diagrams';
	import ExportSettingsFields from './export-settings-fields.svelte';
	import {
		generateBundle,
		generateDocument,
		getExportSettings
	} from '$lib/remote/deliverables/deliverables.remote';
	import { listNoteDocuments } from '$lib/remote/notes/notes.remote';

	let {
		open = $bindable(false),
		projectId,
		folderTitle = '',
		entries = []
	}: {
		open?: boolean;
		projectId: string;
		folderTitle?: string;
		entries?: readonly BulkExportEntry[];
	} = $props();

	let title = $state('');
	let format = $state<'docx' | 'pdf'>('pdf');
	let bundle = $state<'zip' | 'merged'>('zip');
	let settings = $state<ExportSettings>({ ...defaultExportSettings });
	let busy = $state(false);
	let error = $state('');
	let result = $state<{ url: string; fileCount: number } | null>(null);

	const selected = new SvelteSet<string>();

	// The bodies are needed twice — to know whether the diagram controls are worth
	// showing, and to rasterize those diagrams on submit — so they are fetched once
	// when the dialog opens and awaited later rather than fetched twice.
	let documents = $state<readonly NoteDocument[]>([]);
	let documentsLoad = $state<Promise<unknown> | null>(null);

	$effect(() => {
		if (!open) return;
		title = folderTitle;
		format = 'pdf';
		bundle = 'zip';
		result = null;
		error = '';
		selected.clear();
		for (const entry of entries) selected.add(entry.id);
		void loadSettings();
		documents = [];
		documentsLoad = entries.length > 0 ? loadDocuments() : null;
	});

	async function loadSettings(): Promise<void> {
		try {
			settings = { ...(await getExportSettings(projectId)) };
		} catch {
			settings = { ...defaultExportSettings };
		}
	}

	async function loadDocuments(): Promise<void> {
		try {
			documents = await listNoteDocuments(entries.map((entry) => entry.id));
		} catch {
			// The bodies are an optimization: without them diagrams fall back to their
			// source text, which is worth an export rather than a blocked dialog.
			documents = [];
		}
	}

	const selectedEntries = $derived(entries.filter((entry) => selected.has(entry.id)));
	const allSelected = $derived(entries.length > 0 && selectedEntries.length === entries.length);

	const mermaidSources = $derived(
		mermaidSourcesIn(documents.filter((entry) => selected.has(entry.id)))
	);
	const hasDiagrams = $derived(mermaidSources.length > 0);
	const hasSelfStyledDiagrams = $derived(mermaidSources.some(diagramKeepsOwnColours));

	const indent = (depth: number): string =>
		['pl-3', 'pl-8', 'pl-13', 'pl-18', 'pl-23'][depth] ?? 'pl-23';

	function toggle(id: string, checked: boolean): void {
		if (checked) selected.add(id);
		else selected.delete(id);
	}

	function toggleAll(): void {
		if (allSelected) selected.clear();
		else for (const entry of entries) selected.add(entry.id);
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const trimmed = title.trim();
		if (!trimmed || selectedEntries.length === 0) return;
		busy = true;
		error = '';
		try {
			await documentsLoad;
			const {
				svgs: diagramSvgs,
				pngs: diagramPngs,
				sizes: diagramSizes
			} = await renderDiagrams(mermaidSources, settings);
			if (bundle === 'zip') {
				const output = await generateBundle({
					projectId,
					entries: selectedEntries.map((entry) => ({ noteId: entry.id, path: entry.path })),
					title: trimmed,
					format,
					settings,
					diagramSvgs,
					diagramPngs,
					diagramSizes
				});
				result = { url: output.downloadUrl, fileCount: output.fileCount };
			} else {
				const output = await generateDocument({
					projectId,
					noteIds: selectedEntries.map((entry) => entry.id),
					title: trimmed,
					format,
					settings,
					diagramSvgs,
					diagramPngs,
					diagramSizes
				});
				result = { url: output.downloadUrl, fileCount: 1 };
			}
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
			<Dialog.Title>Export documents</Dialog.Title>
			<Dialog.Description>
				Take the notes in {folderTitle || 'this folder'} out as PDF or Word files.
			</Dialog.Description>
		</Dialog.Header>

		<Form class="flex flex-col gap-6" onsubmit={submit}>
			<div class="flex flex-col gap-1">
				<Label for="bulk-export-title" class="eyebrow">Name</Label>
				<Input
					id="bulk-export-title"
					bind:value={title}
					placeholder="Export name"
					disabled={busy}
				/>
			</div>

			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1">
					<span class="eyebrow">Format</span>
					<div class="flex items-center gap-2">
						<Button
							type="button"
							variant={format === 'pdf' ? 'default' : 'outline'}
							size="sm"
							disabled={busy}
							onclick={() => (format = 'pdf')}
						>
							PDF
						</Button>
						<Button
							type="button"
							variant={format === 'docx' ? 'default' : 'outline'}
							size="sm"
							disabled={busy}
							onclick={() => (format = 'docx')}
						>
							DOCX
						</Button>
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<span class="eyebrow">Bundle</span>
					<div class="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant={bundle === 'zip' ? 'default' : 'outline'}
							size="sm"
							disabled={busy}
							onclick={() => (bundle = 'zip')}
						>
							Separate files (.zip)
						</Button>
						<Button
							type="button"
							variant={bundle === 'merged' ? 'default' : 'outline'}
							size="sm"
							disabled={busy}
							onclick={() => (bundle = 'merged')}
						>
							One document
						</Button>
					</div>
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<div class="flex items-baseline justify-between gap-3">
					<span class="eyebrow">Documents · {selectedEntries.length} selected</span>
					<button
						type="button"
						class="provenance-caption hover:underline"
						disabled={busy}
						onclick={toggleAll}
					>
						{allSelected ? 'Select none' : 'Select all'}
					</button>
				</div>
				<!-- Bled past the measure so the rows read as one continuous list, with an
				     inset gutter on the right because the scrollbar overlays the content. -->
				<ul
					class="-mx-3 max-h-64 divide-y divide-border overflow-y-auto border-t border-border pr-3"
				>
					{#each entries as entry (entry.id)}
						<li>
							<!--
								bits-ui's checkbox is a button, so a wrapping label does not toggle it the
								way it would a native input. The label answers clicks that land on the row
								itself and leaves clicks on the control to the control.
							-->
							<Label
								class="row-quiet {indent(
									entry.depth
								)} flex h-11 w-full items-center gap-2 pr-2 text-sm font-normal sm:h-9"
								onclick={(event: MouseEvent) => {
									if ((event.target as HTMLElement | null)?.closest('[role="checkbox"]')) return;
									toggle(entry.id, !selected.has(entry.id));
								}}
							>
								<Checkbox
									checked={selected.has(entry.id)}
									onCheckedChange={(checked) => toggle(entry.id, checked === true)}
									disabled={busy}
									aria-label={entry.title}
								/>
								<span class="min-w-0 flex-1 truncate">{entry.title}</span>
								{#if entry.depth > 0}
									<span class="provenance-caption shrink-0 truncate">
										{entry.path.slice(0, entry.path.lastIndexOf('/'))}
									</span>
								{/if}
							</Label>
						</li>
					{/each}
				</ul>
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
					<p class="text-sm font-medium">
						{result.fileCount === 1 ? 'Document ready' : `${result.fileCount} documents ready`}
					</p>
					<a href={result.url} download class="text-sm text-primary underline hover:no-underline">
						Download
					</a>
					{#if bundle === 'zip'}
						<p class="provenance-caption text-center">
							Bundles are not saved to Artifacts. Download it now.
						</p>
					{:else}
						<a
							href="/artifacts?projectId={projectId}"
							class="text-xs text-muted-foreground underline"
						>
							View in Artifacts
						</a>
					{/if}
				</div>
			{/if}

			{#if error}
				<p class="text-sm text-destructive">{error}</p>
			{/if}

			<Dialog.Footer class="sm:justify-end">
				<Button type="button" variant="ghost" onclick={() => (open = false)}>
					{result ? 'Close' : 'Cancel'}
				</Button>
				{#if !result}
					<Button type="submit" disabled={busy || !title.trim() || selectedEntries.length === 0}>
						{busy ? 'Generating…' : 'Generate'}
					</Button>
				{/if}
			</Dialog.Footer>
		</Form>
	</Dialog.Content>
</Dialog.Root>
