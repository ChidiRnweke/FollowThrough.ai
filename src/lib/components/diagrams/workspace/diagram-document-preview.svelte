<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner';
	import DrawioEmbed from '../drawio-embed.svelte';
	import DiagramPreview from '../diagram-preview.svelte';

	let { source, title = 'Untitled diagram' }: { source: string; title?: string } = $props();
	let preview = $state<
		| { source: string; kind: 'ready'; svg: string }
		| { source: string; kind: 'failed'; message: string }
	>();
	let current = $derived(preview?.source === source ? preview : undefined);
</script>

<div class="relative flex min-h-64 flex-1 items-center justify-center overflow-hidden">
	{#if current?.kind === 'ready'}
		<DiagramPreview
			kind="drawio"
			{source}
			{title}
			renderedSvg={current.svg}
			class="size-full object-contain"
		/>
	{:else if current?.kind === 'failed'}
		<p role="alert" class="text-sm text-destructive">{current.message}</p>
	{:else}
		<div role="status" class="flex items-center gap-2 text-sm text-muted-foreground">
			<Spinner />
			Drawing preview…
		</div>
	{/if}
	{#key source}
		{@const requestedSource = source}
		{#if current?.kind !== 'ready'}
			<!-- Render the exact XML; a draft's stored SVG can belong to an older publication. -->
			<div class="sr-only" inert aria-hidden="true">
				<DrawioEmbed
					xml={requestedSource}
					{title}
					oncommit={async () => undefined}
					oncapturepreview={async (output) => {
						if (source === requestedSource) {
							preview = { source: requestedSource, kind: 'ready', svg: output.svg };
						}
					}}
					onstatus={(status) => {
						if (source === requestedSource && status.phase === 'failed') {
							preview = { source: requestedSource, kind: 'failed', message: status.failure };
						}
					}}
				/>
			</div>
		{/if}
	{/key}
</div>
