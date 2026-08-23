<script lang="ts">
	import { mode as colorMode } from 'mode-watcher';
	import type { DiagramKind } from '$lib/models/diagrams';
	import {
		initializeMermaid,
		renderMermaidOffscreen,
		sanitizeMermaidSvg
	} from '$lib/components/edra/mermaid-rendering';
	import SafeSvgPreview from '$lib/components/shared/safe-svg-preview.svelte';

	/*
		The two kinds are not symmetrical, and this component is where that shows.

		Mermaid is text. It is drawn from its source, here in the browser, because
		the source is the diagram and nothing else needs storing — which is also why
		a Mermaid draft in the studio has no row behind it and can still be shown.

		draw.io is opaque XML. Nothing can draw it but draw.io, so what is shown is
		the SVG its embed exported on save. With no export there is nothing to show,
		and saying so is better than rendering the XML.
	*/
	let {
		kind,
		source,
		renderedSvg,
		title = 'Untitled diagram',
		class: className = ''
	}: {
		kind: DiagramKind;
		source: string;
		renderedSvg?: string;
		title?: string;
		class?: string;
	} = $props();

	let host = $state<HTMLElement | null>(null);
	let failed = $state(false);

	// Drawing into a detached node is inherently an effect, and asynchronous: this
	// mirrors how the note editor's Mermaid node view renders.
	$effect(() => {
		if (kind !== 'mermaid' || !host) return;
		const text = source;
		// Re-render on a theme change so a preview matches the surface it sits on.
		void colorMode.current;
		const target = host;
		let cancelled = false;
		void (async () => {
			try {
				initializeMermaid(colorMode.current === 'dark');
				const svg = await renderMermaidOffscreen(`diagram-preview-${crypto.randomUUID()}`, text);
				if (cancelled) return;
				target.innerHTML = sanitizeMermaidSvg(svg);
				failed = false;
			} catch {
				if (cancelled) return;
				target.replaceChildren();
				failed = true;
			}
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

{#if kind === 'drawio'}
	{#if renderedSvg}
		<SafeSvgPreview svg={renderedSvg} alt={title} class={className} />
	{:else}
		<div class="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
			No preview yet
		</div>
	{/if}
{:else if failed}
	<div class="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
		This diagram could not be drawn
	</div>
{:else}
	<div
		bind:this={host}
		role="img"
		aria-label={title}
		class="flex h-full w-full items-center justify-center overflow-hidden [&>svg]:h-full [&>svg]:max-w-full"
	></div>
{/if}
