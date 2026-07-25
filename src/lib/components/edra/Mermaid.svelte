<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import type { NodeViewProps } from '@tiptap/core';
	import type { DiagramSuggestion, DrawioDiagram, SuggestionId } from '$lib/models';
	import mermaid from 'mermaid';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { cn } from '$lib/utils.js';
	import Workflow from '@lucide/svelte/icons/workflow';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Copy from '@lucide/svelte/icons/copy';
	import Check from '@lucide/svelte/icons/check';
	import Eye from '@lucide/svelte/icons/eye';
	import Code from '@lucide/svelte/icons/code';
	import Columns2 from '@lucide/svelte/icons/columns-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Shapes from '@lucide/svelte/icons/shapes';
	import X from '@lucide/svelte/icons/x';
	import { NodeViewWrapper } from './index.js';
	import { initializeMermaid, sanitizeMermaidSvg } from './mermaid-rendering.js';
	import { mode as colorMode } from 'mode-watcher';
	import Tooltip from './Tooltip.svelte';
	import { Download } from '@lucide/svelte';
	import DrawioReviewDialog from '$lib/components/app/drawio-review-dialog.svelte';
	import type { DrawioExport } from '$lib/client/drawio/embed-adapter';
	import {
		insertAcceptedDrawioAfterMermaid,
		setPendingDrawioSuggestion as applyPendingDrawioSuggestion
	} from '$lib/client/drawio/tiptap-actions';
	import { createMediaResize } from './media-resize.svelte.js';

	const { node, editor, getPos, extension, updateAttributes }: NodeViewProps = $props();
	const options = $derived(
		extension.options as {
			onRevise?: (
				source: string,
				instruction: string
			) => Promise<{ readonly source: string; readonly title?: string }>;
			onConvert?: (source: string, instruction?: string) => Promise<DiagramSuggestion>;
			getDrawioSuggestion?: (suggestionId: SuggestionId) => DiagramSuggestion | undefined;
			onAcceptDrawio?: (
				suggestionId: SuggestionId,
				source: string,
				renderedSvg: string
			) => Promise<DrawioDiagram>;
			onRejectDrawio?: (suggestionId: SuggestionId) => Promise<void>;
		}
	);
	const onRevise = $derived(options.onRevise);
	const pendingDrawioSuggestionId = $derived(
		(node.attrs.pendingDrawioSuggestionId as SuggestionId | null) ?? null
	);
	const drawioSuggestion = $derived(
		pendingDrawioSuggestionId ? options.getDrawioSuggestion?.(pendingDrawioSuggestionId) : undefined
	);

	// The committed code from the document
	const code = $derived(node.textContent);

	// Local editing state
	let editCode = $state('');
	let isEditing = $state(false);
	let mode = $state<'both' | 'code' | 'preview'>('both');
	let copied = $state(false);
	let showAiRevision = $state(false);
	let revisionInstruction = $state('');
	let isRevising = $state(false);
	let revisionError = $state<string | null>(null);
	let isConverting = $state(false);
	let conversionError = $state<string | null>(null);
	let reviewOpen = $state(false);

	// Render state
	let container: HTMLDivElement | null = $state(null);
	let previewContainer: HTMLDivElement | null = $state(null);
	let previewWrapper: HTMLDivElement | null = $state(null);
	let error: string | null = $state(null);
	let isRendering = $state(false);

	// Drag-resize (preview mode) — persists width as a node attribute, like
	// images. Values above 100% zoom the diagram beyond the block width; the
	// container then scrolls horizontally so labels can be made readable even
	// for very wide diagrams.
	const widthPercent = $derived(parseFloat((node.attrs.width as string) ?? '100') || 100);
	/** Wrapper never exceeds the editor width — the SVG zooms inside it. */
	const wrapperWidth = $derived(`${Math.min(widthPercent, 100)}%`);
	/** SVG fills the wrapper (≤100%) or overflows it with scroll (>100%). */
	const svgWidth = $derived(`${Math.max(widthPercent, 100)}%`);
	const mediaResize = createMediaResize({
		getParentEl: () => previewWrapper?.parentElement,
		getWidthPercent: () => widthPercent,
		maxWidthPercent: 300,
		onWidth: (percent) => updateAttributes({ width: `${percent}%` })
	});

	// Debounce
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let renderCounter = 0;

	async function renderMermaid(target: HTMLDivElement | null, source: string) {
		if (!target || !source.trim()) {
			if (target) target.innerHTML = '';
			error = null;
			return;
		}

		const thisRender = ++renderCounter;
		isRendering = true;

		const id = `mermaid-${crypto.randomUUID().slice(0, 8)}`;
		try {
			// Re-apply the config each render so diagrams always use the current theme.
			initializeMermaid(colorMode.current === 'dark');
			const { svg } = await mermaid.render(id, source);
			// Stale check — discard if a newer render was triggered
			if (thisRender !== renderCounter) return;
			target.innerHTML = sanitizeMermaidSvg(svg);
			error = null;
		} catch (err) {
			if (thisRender !== renderCounter) return;
			error =
				(err as Error).message
					?.replace(/[\s\S]*?Syntax error in text[\s\S]*?mermaid version[\s\S]*$/m, '')
					.trim() ||
				(err as Error).message ||
				'Failed to render diagram';
			// Clean up mermaid's orphaned SVG
			document.getElementById(id)?.remove();
		} finally {
			if (thisRender === renderCounter) {
				isRendering = false;
			}
		}
	}

	function debouncedRender(target: HTMLDivElement | null, source: string, delay = 400) {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => renderMermaid(target, source), delay);
	}

	// Render inline preview when code or the color theme changes (not editing)
	$effect(() => {
		void colorMode.current;
		if (!isEditing && code !== undefined && container) {
			renderMermaid(container, code);
		}
	});

	// Render editor preview when editCode or the color theme changes
	$effect(() => {
		void colorMode.current;
		if (isEditing && (mode === 'both' || mode === 'preview') && previewContainer && editCode) {
			debouncedRender(previewContainer, editCode, 500);
		}
	});

	onMount(() => {
		mediaResize.attach();
		if (container && code) {
			renderMermaid(container, code);
		}
	});

	onDestroy(() => {
		mediaResize.detach();
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	function enterEditMode() {
		if (!editor.isEditable) return;
		editCode = code;
		isEditing = true;
		error = null;
		showAiRevision = false;
		revisionError = null;
	}

	function enterAiRevision() {
		enterEditMode();
		showAiRevision = true;
	}

	function setPendingDrawioSuggestion(suggestionId: SuggestionId | null): void {
		const position = getPos();
		if (typeof position !== 'number') return;
		applyPendingDrawioSuggestion(
			{
				state: editor.state,
				schema: editor.schema,
				dispatch: (transaction) => editor.view.dispatch(transaction)
			},
			node,
			position,
			suggestionId
		);
	}

	async function convertToDrawio(): Promise<void> {
		if (!options.onConvert || isConverting || pendingDrawioSuggestionId) return;
		const committedSource = code;
		isConverting = true;
		conversionError = null;
		try {
			const suggestion = await options.onConvert(code);
			if (code !== committedSource)
				throw new Error('The Mermaid diagram changed while conversion was running. Try again.');
			setPendingDrawioSuggestion(suggestion.id);
			reviewOpen = true;
		} catch (failure) {
			conversionError =
				failure instanceof Error ? failure.message : 'The diagram could not be converted.';
		} finally {
			isConverting = false;
		}
	}

	async function acceptDrawio(output: DrawioExport): Promise<void> {
		if (!pendingDrawioSuggestionId || !options.onAcceptDrawio) return;
		const diagram = await options.onAcceptDrawio(pendingDrawioSuggestionId, output.xml, output.svg);
		const position = getPos();
		if (typeof position !== 'number')
			throw new Error('The accepted diagram could not be inserted into this note.');
		insertAcceptedDrawioAfterMermaid(
			{
				state: editor.state,
				schema: editor.schema,
				dispatch: (transaction) => editor.view.dispatch(transaction)
			},
			node,
			position,
			diagram.id
		);
	}

	async function rejectDrawio(): Promise<void> {
		if (!pendingDrawioSuggestionId || !options.onRejectDrawio) return;
		conversionError = null;
		try {
			await options.onRejectDrawio(pendingDrawioSuggestionId);
			setPendingDrawioSuggestion(null);
			reviewOpen = false;
		} catch (failure) {
			conversionError = failure instanceof Error ? failure.message : 'Dismissal failed.';
		}
	}

	async function reviseWithAi() {
		const instruction = revisionInstruction.trim();
		if (!onRevise || !instruction || isRevising) return;
		const committedSource = code;
		isRevising = true;
		revisionError = null;
		try {
			const revised = await onRevise(editCode, instruction);
			if (code !== committedSource)
				throw new Error('The diagram changed while the revision was running. Try again.');
			editor
				.chain()
				.focus()
				.insertContentAt(
					{ from: getPos() ?? 0, to: (getPos() ?? 0) + node.nodeSize },
					{
						type: 'mermaid',
						content: [{ type: 'text', text: revised.source }]
					}
				)
				.run();
			isEditing = false;
			showAiRevision = false;
			revisionInstruction = '';
		} catch (revisionFailure) {
			revisionError =
				revisionFailure instanceof Error ? revisionFailure.message : 'Diagram revision failed.';
		} finally {
			isRevising = false;
		}
	}

	function handleRevisionKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			showAiRevision = false;
			revisionError = null;
		}
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void reviseWithAi();
		}
	}

	function handleSave() {
		const trimmed = editCode.trim();
		if (!trimmed) {
			// Delete the node if empty
			editor
				.chain()
				.focus()
				.deleteRange({
					from: getPos() ?? 0,
					to: (getPos() ?? 0) + node.nodeSize
				})
				.run();
		} else {
			editor
				.chain()
				.focus()
				.insertContentAt(
					{ from: getPos() ?? 0, to: (getPos() ?? 0) + node.nodeSize },
					{
						type: 'mermaid',
						content: [{ type: 'text', text: trimmed }]
					}
				)
				.run();
		}
		isEditing = false;
	}

	function handleCancel() {
		isEditing = false;
		error = null;
	}

	function handleEditorKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			handleCancel();
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault();
			handleSave();
		}
		// Prevent tiptap from handling Tab
		if (e.key === 'Tab') {
			e.preventDefault();
			const target = e.target as HTMLTextAreaElement;
			const start = target.selectionStart;
			const end = target.selectionEnd;
			editCode = editCode.substring(0, start) + '  ' + editCode.substring(end);
			tick().then(() => {
				target.selectionStart = target.selectionEnd = start + 2;
			});
		}
	}

	async function copyCode() {
		const source = isEditing ? editCode : code;
		if (!source) return;
		await navigator.clipboard.writeText(source);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	function downloadImage() {
		const svgEl = container?.querySelector('svg');
		if (!svgEl) return;

		const svgString = new XMLSerializer().serializeToString(svgEl);
		const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
		const DOMURL = window.URL || window.webkitURL || window;
		const url = DOMURL.createObjectURL(svgBlob);

		const rect = svgEl.getBoundingClientRect();
		const viewBoxWidth = svgEl.viewBox?.baseVal?.width;
		const viewBoxHeight = svgEl.viewBox?.baseVal?.height;

		const width = viewBoxWidth && viewBoxWidth > 0 ? viewBoxWidth : rect.width || 800;
		const height = viewBoxHeight && viewBoxHeight > 0 ? viewBoxHeight : rect.height || 600;

		const dpr = window.devicePixelRatio || 1;
		const image = new Image();

		image.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			const context = canvas.getContext('2d');
			if (!context) return;

			context.scale(dpr, dpr);

			const pageBackground = getComputedStyle(document.body).backgroundColor;
			context.fillStyle =
				pageBackground === 'rgba(0, 0, 0, 0)' ? '#ffffff' : pageBackground || '#ffffff';
			context.fillRect(0, 0, width, height);

			context.drawImage(image, 0, 0, width, height);

			const pngUrl = canvas.toDataURL('image/png');
			const downloadLink = document.createElement('a');
			downloadLink.href = pngUrl;
			downloadLink.download = 'mermaid-diagram.png';
			document.body.appendChild(downloadLink);
			downloadLink.click();
			document.body.removeChild(downloadLink);
			DOMURL.revokeObjectURL(url);
		};

		image.src = url;
	}

	const lineCount = $derived((isEditing ? editCode : code)?.split('\n').length ?? 0);
</script>

<NodeViewWrapper
	class="diagram-node my-4! w-full flex flex-col items-center group relative rounded-lg overflow-hidden"
	contenteditable={false}
>
	{#if isEditing}
		<!-- Editing Mode -->
		<div class="w-full flex flex-col border rounded-lg overflow-hidden bg-background h-112">
			<!-- Toolbar -->
			<div class="border-b bg-muted/30 px-3 py-1.5 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<Workflow class="size-3.5 text-primary" />
					<span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
						>Mermaid</span
					>
					<span class="text-muted-foreground/50 text-[10px]">{lineCount} lines</span>
				</div>
				<div class="flex items-center gap-1">
					{#if onRevise}
						<Button
							size="sm"
							variant={showAiRevision ? 'secondary' : 'ghost'}
							onclick={() => (showAiRevision = !showAiRevision)}
						>
							<Sparkles />
							Revise with AI
						</Button>
					{/if}
					<Tabs.Root bind:value={mode}>
						<Tabs.List>
							<Tabs.Trigger value="code" class="px-2 py-1">
								<Code />
							</Tabs.Trigger>
							<Tabs.Trigger value="both" class="px-2 py-1">
								<Columns2 />
							</Tabs.Trigger>
							<Tabs.Trigger value="preview" class="px-2 py-1">
								<Eye />
							</Tabs.Trigger>
						</Tabs.List>
					</Tabs.Root>
					<Tooltip tooltip="Copy code">
						<Button size="icon-sm" variant="ghost" onclick={copyCode} aria-label="Copy code">
							{#if copied}
								<Check class="text-green-500" />
							{:else}
								<Copy />
							{/if}
						</Button>
					</Tooltip>

					<div class="bg-border mx-1 h-4 w-px"></div>

					<Button size="sm" variant="ghost" onclick={handleCancel}>Cancel</Button>
					<Button size="sm" onclick={handleSave}>Apply</Button>
				</div>
			</div>
			{#if showAiRevision && onRevise}
				<div class="flex items-start gap-2 border-b bg-muted/20 p-3">
					<div class="min-w-0 flex-1 space-y-1.5">
						<Textarea
							bind:value={revisionInstruction}
							onkeydown={handleRevisionKeydown}
							placeholder="Describe what to change…"
							aria-label="Diagram revision instruction"
							rows={2}
							disabled={isRevising}
						/>
						{#if revisionError}
							<p class="text-xs text-destructive" role="alert">{revisionError}</p>
						{:else}
							<p class="text-xs text-muted-foreground">Ctrl/⌘+Enter to revise</p>
						{/if}
					</div>
					<Button
						disabled={!revisionInstruction.trim() || isRevising}
						onclick={() => void reviseWithAi()}
					>
						{#if isRevising}<LoaderCircle class="animate-spin" />{/if}
						Revise
					</Button>
				</div>
			{/if}

			<!-- Editor Content -->
			<div class="flex flex-1 min-h-0 overflow-hidden">
				{#if mode === 'both' || mode === 'code'}
					<div class={cn('flex-1 min-h-0 relative', mode === 'both' ? 'border-r' : '')}>
						<textarea
							bind:value={editCode}
							onkeydown={handleEditorKeydown}
							placeholder="graph TD&#10;  A[Start] --> B[End]"
							spellcheck={false}
							class="mermaid-code-editor size-full resize-none border-none bg-muted/20 p-4 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
						></textarea>
						<!-- Keyboard hints -->
						<div
							class="absolute bottom-2 right-2 flex items-center gap-2 text-[9px] text-muted-foreground/50"
						>
							<span>⌘↵ Apply</span>
							<span>Esc Cancel</span>
						</div>
					</div>
				{/if}
				{#if mode === 'both' || mode === 'preview'}
					<div
						class="flex-1 min-h-0 overflow-auto bg-background flex items-center justify-center p-6 relative"
					>
						{#if error}
							<div class="flex flex-col items-center gap-2 text-center max-w-xs">
								<div class="bg-destructive/10 flex size-8 items-center justify-center rounded-lg">
									<TriangleAlert class="text-destructive size-4" />
								</div>
								<p class="text-destructive text-xs font-medium">Syntax Error</p>
								<p
									class="text-muted-foreground font-mono text-[10px] leading-relaxed max-h-24 overflow-auto"
								>
									{error}
								</p>
							</div>
						{:else if isRendering && !previewContainer?.innerHTML}
							<div class="flex flex-col items-center gap-2">
								<div
									class="size-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-primary"
								></div>
								<span class="text-muted-foreground text-[10px]">Rendering...</span>
							</div>
						{/if}
						<div
							bind:this={previewContainer}
							class={cn(
								'mermaid-preview flex items-center justify-center [&_svg]:max-w-full [&_svg]:h-auto',
								error ? 'hidden' : ''
							)}
						></div>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Preview Mode -->
		<div
			bind:this={previewWrapper}
			class="relative group/preview"
			style={`width: ${wrapperWidth}; --mermaid-svg-width: ${svgWidth}`}
		>
			{#if !code || code.trim() === ''}
				<button
					class="flex w-full items-center gap-2 rounded-lg border border-dashed bg-muted/30 p-4 transition-colors hover:bg-muted/50 min-h-14"
					onclick={enterEditMode}
				>
					<Workflow class="size-4 text-muted-foreground" />
					<span class="text-muted-foreground text-sm" contenteditable={false}
						>Click to add a Mermaid diagram</span
					>
				</button>
			{:else}
				<div class="border rounded-lg overflow-hidden">
					<div
						bind:this={container}
						class="mermaid-container overflow-x-auto p-6 w-full flex min-h-24 items-center [&_svg]:w-[var(--mermaid-svg-width)] [&_svg]:shrink-0 [&_svg]:mx-auto [&_svg]:max-w-none! [&_svg]:h-auto"
					></div>
					{#if error}
						<div class="border-t bg-destructive/5 px-4 py-2 flex items-center gap-2">
							<TriangleAlert class="text-destructive size-3.5 shrink-0" />
							<p class="text-destructive text-xs truncate">{error}</p>
						</div>
					{/if}
				</div>
				{#if pendingDrawioSuggestionId}
					<div class="flex min-h-10 items-center gap-2 border-x border-b border-border px-3 py-2">
						<Shapes class="size-4 text-primary" />
						<p class="min-w-0 flex-1 text-xs text-muted-foreground">
							{drawioSuggestion
								? 'draw.io conversion ready to review'
								: 'draw.io conversion pending'}
						</p>
						{#if drawioSuggestion}
							<Button size="sm" variant="outline" onclick={() => (reviewOpen = true)}>Review</Button
							>
						{/if}
						<Tooltip tooltip="Dismiss conversion">
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label="Dismiss conversion"
								onclick={() => void rejectDrawio()}
							>
								<X />
							</Button>
						</Tooltip>
					</div>
				{:else if conversionError}
					<p
						class="border-x border-b border-border px-3 py-2 text-xs text-destructive"
						role="alert"
					>
						{conversionError}
					</p>
				{/if}
				<!-- Resize handles -->
				{#if editor.isEditable}
					<div
						role="button"
						tabindex="0"
						aria-label="Resize diagram"
						class="absolute inset-y-0 z-20 flex w-5 cursor-col-resize items-center justify-start p-2"
						style="left: 0px"
						onmousedown={(event: MouseEvent) => mediaResize.startResize(event, 'left')}
						ontouchstart={(event: TouchEvent) => mediaResize.handleTouchStart(event, 'left')}
					>
						<div
							class="bg-muted z-20 h-16 w-1 rounded-xl border opacity-0 transition-all group-hover/preview:opacity-100"
						></div>
					</div>
					<div
						role="button"
						tabindex="0"
						aria-label="Resize diagram"
						class="absolute inset-y-0 z-20 flex w-5 cursor-col-resize items-center justify-end p-2"
						style="right: 0px"
						onmousedown={(event: MouseEvent) => mediaResize.startResize(event, 'right')}
						ontouchstart={(event: TouchEvent) => mediaResize.handleTouchStart(event, 'right')}
					>
						<div
							class="bg-muted z-20 h-16 w-1 rounded-xl border opacity-0 transition-all group-hover/preview:opacity-100"
						></div>
					</div>
				{/if}
				<!-- Hover actions -->
				{#if editor.isEditable}
					<div
						class="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/preview:opacity-100 transition-opacity"
					>
						{#if options.onConvert && !pendingDrawioSuggestionId}
							<Tooltip tooltip="Convert to draw.io">
								<Button
									size="icon-sm"
									variant="ghost"
									disabled={isConverting}
									onclick={() => void convertToDrawio()}
									aria-label="Convert to draw.io"
								>
									{#if isConverting}<LoaderCircle class="animate-spin" />{:else}<Shapes
											class="text-muted-foreground"
										/>{/if}
								</Button>
							</Tooltip>
						{/if}
						{#if onRevise}
							<Tooltip tooltip="Revise with AI">
								<Button
									size="icon-sm"
									variant="ghost"
									onclick={enterAiRevision}
									aria-label="Revise with AI"
								>
									<Sparkles class="text-muted-foreground" />
								</Button>
							</Tooltip>
						{/if}
						<Tooltip tooltip="Download Image">
							<Button
								size="icon-sm"
								variant="ghost"
								onclick={downloadImage}
								aria-label="Download image"
							>
								<Download class="text-muted-foreground" />
							</Button>
						</Tooltip>
						<Tooltip tooltip="Copy Code">
							<Button size="icon-sm" variant="ghost" onclick={copyCode} aria-label="Copy code">
								{#if copied}
									<Check class=" text-green-500" />
								{:else}
									<Copy class="text-muted-foreground" />
								{/if}
							</Button>
						</Tooltip>
						<Tooltip tooltip="Edit Mode">
							<Button
								size="icon-sm"
								variant="ghost"
								onclick={enterEditMode}
								aria-label="Edit diagram"
							>
								<Pencil class="text-muted-foreground" />
							</Button>
						</Tooltip>
					</div>
				{/if}
			{/if}
		</div>
		{#if drawioSuggestion}
			<DrawioReviewDialog
				bind:open={reviewOpen}
				suggestion={drawioSuggestion}
				onaccept={acceptDrawio}
			/>
		{/if}
	{/if}
</NodeViewWrapper>
