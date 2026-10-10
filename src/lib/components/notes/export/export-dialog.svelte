<script lang="ts">
	import { untrack } from 'svelte';
	import { createDocumentExports } from '$lib/factories/deliverables/export';
	const exports = createDocumentExports();

	import { Form } from '$lib/components/ui/form';
	import type { ExportSettings } from '$lib/models/deliverables';
	import type { ProseMirrorDocument } from '$lib/models/notes';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import { FtChevronRight as ChevronRight } from '$lib/components/icons';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';

	import ExportSettingsFields from './export-settings-fields.svelte';

	let {
		open = $bindable(false),
		projectId,
		defaultTitle = '',
		defaultNoteIds = [],
		documents = [],
		diagrams = []
	}: {
		open?: boolean;
		projectId: string;
		defaultTitle?: string;
		defaultNoteIds?: string[];
		documents?: readonly { id: string; document: ProseMirrorDocument }[];
		/** The note's draw.io diagrams, whose exported SVG is what the document embeds. */
		diagrams?: readonly { readonly id: string; readonly renderedSvg?: string }[];
	} = $props();

	let title = $state('');
	let format = $state<'docx' | 'pdf'>('pdf');
	let settings = $state<ExportSettings>({ ...defaultExportSettings });
	const busy = $derived(exports.busy);
	const settingsReady = $derived(exports.ready);
	let previewOpen = $state(false);
	const previewUrl = $derived(exports.previewUrl);
	const result = $derived(exports.result);
	const error = $derived(exports.error);

	$effect(() => {
		if (!open) {
			previewOpen = false;
			return;
		}
		title = defaultTitle;
		format = 'pdf';
		const id = projectId;
		void untrack(() => exports.open(id)).then((loaded) => {
			if (loaded.kind === 'ready') settings = { ...loaded.settings };
		});
		return () => exports.close();
	});

	// Colour controls only earn their space when there is a diagram to colour, and the
	// palette caveat only when a diagram ignores the palette.
	const diagramSummary = $derived(exports.inspect(documents));
	const hasDiagrams = $derived(diagramSummary.hasDiagrams);
	const hasSelfStyledDiagrams = $derived(diagramSummary.hasSelfStyledDiagrams);

	async function preview(): Promise<void> {
		await exports.preview({
			projectId,
			noteIds: defaultNoteIds,
			title,
			settings,
			documents,
			diagrams
		});
		if (exports.previewUrl) previewOpen = true;
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		void exports.generate({
			projectId,
			noteIds: defaultNoteIds,
			title,
			format,
			settings,
			documents,
			diagrams
		});
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
					<ExportSettingsFields
						bind:settings
						disabled={busy || !settingsReady}
						{hasDiagrams}
						{hasSelfStyledDiagrams}
					/>
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
					disabled={busy || !settingsReady || !title.trim()}
					onclick={() => void preview()}
				>
					{busy ? 'Working…' : 'Preview PDF'}
				</Button>
				{#if !result}
					<Button type="submit" disabled={busy || !settingsReady || !title.trim()}>
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
