<script lang="ts">
	import { Form } from '$lib/components/ui/form';
	import type { ExportSettings } from '$lib/models/deliverables';
	import { defaultExportSettings } from '$lib/models/deliverables';
	import { mode } from 'mode-watcher';
	import { FtChevronRight as ChevronRight } from '$lib/components/icons';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import {
		initializeMermaid,
		sanitizeMermaidSvg,
		diagramKeepsOwnColours
	} from '$lib/components/edra/mermaid-rendering';
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

	function collectMermaidSources(node: unknown, sources: string[]): void {
		if (typeof node !== 'object' || node === null) return;
		const record = node as { type?: string; text?: string; content?: unknown[] };
		if (record.type === 'mermaid') {
			const text = (record.content ?? [])
				.map((child) => (child as { text?: string }).text ?? '')
				.join('');
			if (text.trim()) sources.push(text);
			return;
		}
		for (const child of record.content ?? []) collectMermaidSources(child, sources);
	}

	// Colour controls only earn their space when there is a diagram to colour, and the
	// palette caveat only when a diagram ignores the palette.
	const mermaidSources = $derived.by(() => {
		const sources: string[] = [];
		for (const entry of documents) collectMermaidSources(entry.document, sources);
		return sources;
	});
	const hasDiagrams = $derived(mermaidSources.length > 0);
	const hasSelfStyledDiagrams = $derived(mermaidSources.some(diagramKeepsOwnColours));

	async function sha256hex(value: string): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
		return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	}

	const INLINED_PROPERTIES = [
		'fill',
		'fill-opacity',
		'stroke',
		'stroke-width',
		'stroke-dasharray',
		'opacity',
		'font-size',
		'font-weight',
		'text-anchor'
	];

	/**
	 * Mermaid styles its SVG through a <style> block, which PDF SVG rendering ignores.
	 * Mount the SVG off-screen and bake the computed styles into presentation attributes.
	 */
	function inlineSvgStyles(markup: string): string {
		const host = document.createElement('div');
		host.style.position = 'fixed';
		host.style.left = '-10000px';
		host.style.top = '0';
		host.innerHTML = markup;
		document.body.appendChild(host);
		try {
			const svg = host.querySelector('svg');
			if (!svg) return markup;
			const elements = [...svg.querySelectorAll('*')].filter(
				(element) => element.tagName.toLowerCase() !== 'style'
			);
			// Read all computed values before mutating anything: stripping a class would
			// break the CSS selectors that style the element's descendants.
			const resolved = elements.map((element) => {
				const computed = getComputedStyle(element);
				return INLINED_PROPERTIES.map(
					(property) => [property, computed.getPropertyValue(property)] as const
				);
			});
			elements.forEach((element, index) => {
				for (const [property, value] of resolved[index]!) {
					if (value) element.setAttribute(property, value.replaceAll('px', ''));
				}
				element.removeAttribute('class');
				element.removeAttribute('style');
			});
			svg.querySelectorAll('style').forEach((styleElement) => styleElement.remove());
			svg.removeAttribute('style');
			return svg.outerHTML;
		} finally {
			host.remove();
		}
	}

	/**
	 * Rasterize an SVG to a PNG data URL. DOCX embeds rasters (the docx library only
	 * takes SVG with a mandatory raster fallback), so diagrams ship in both forms:
	 * SVG for the PDF, PNG for the DOCX.
	 */
	async function rasterizeSvg(svgMarkup: string, scale = 2): Promise<string | null> {
		try {
			const url = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml' }));
			try {
				const image = new Image();
				await new Promise<void>((resolve, reject) => {
					image.onload = () => resolve();
					image.onerror = () => reject(new Error('SVG rasterization failed'));
					image.src = url;
				});
				// Mermaid SVGs size themselves through max-width, not width/height, so the
				// viewBox is the only reliable natural size.
				const viewBox = /viewBox="([\d.\s-]+)"/
					.exec(svgMarkup)?.[1]
					?.trim()
					.split(/\s+/)
					.map(Number);
				const baseWidth = viewBox?.[2] || image.naturalWidth || 800;
				const baseHeight = viewBox?.[3] || image.naturalHeight || 600;
				const canvas = document.createElement('canvas');
				canvas.width = Math.round(baseWidth * scale);
				canvas.height = Math.round(baseHeight * scale);
				const context2d = canvas.getContext('2d');
				if (!context2d) return null;
				// Transparent pixels print as black boxes in some Word viewers.
				context2d.fillStyle = '#ffffff';
				context2d.fillRect(0, 0, canvas.width, canvas.height);
				context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
				return canvas.toDataURL('image/png');
			} finally {
				URL.revokeObjectURL(url);
			}
		} catch {
			return null;
		}
	}

	/** Render every mermaid block so the server can embed diagrams (SVG + PNG raster). */
	async function renderDiagrams(): Promise<{
		svgs: Record<string, string>;
		pngs: Record<string, string>;
	}> {
		const sources = mermaidSources;
		if (sources.length === 0) return { svgs: {}, pngs: {} };
		const svgs: Record<string, string> = {};
		const pngs: Record<string, string> = {};
		// Diagrams follow the export's own palette, never the reader's colour mode: the
		// document lands somewhere we do not control, and a dark-mode render is unusable
		// on paper. Defaults to light for the same reason.
		const mermaid = initializeMermaid({
			base: settings.diagramTheme?.base ?? 'light',
			...(settings.diagramTheme?.colors ? { palette: settings.diagramTheme.colors } : {})
		});
		try {
			for (const source of sources) {
				try {
					const { svg } = await mermaid.render(`export-diagram-${crypto.randomUUID()}`, source);
					// Inline before sanitizing: the sanitizer strips the <style> block the
					// computed styles are read from.
					const markup = sanitizeMermaidSvg(inlineSvgStyles(svg));
					const hash = await sha256hex(source);
					svgs[hash] = markup;
					const png = await rasterizeSvg(markup);
					if (png) pngs[hash] = png;
				} catch {
					// A diagram that fails to render falls back to its source in the document.
				}
			}
		} finally {
			initializeMermaid(mode.current === 'dark');
		}
		return { svgs, pngs };
	}

	async function preview(): Promise<void> {
		const trimmed = title.trim();
		if (!trimmed) return;
		busy = true;
		error = '';
		try {
			const { svgs: diagramSvgs, pngs: diagramPngs } = await renderDiagrams();
			const output = await previewDocument({
				projectId,
				noteIds: defaultNoteIds,
				title: trimmed,
				settings,
				diagramSvgs,
				diagramPngs
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
			const { svgs: diagramSvgs, pngs: diagramPngs } = await renderDiagrams();
			const output = await generateDocument({
				projectId,
				noteIds: defaultNoteIds,
				title: trimmed,
				format,
				settings,
				diagramSvgs,
				diagramPngs
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
