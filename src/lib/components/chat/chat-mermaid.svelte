<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { createMermaidRender } from './mermaid-render.svelte.js';

	let { source }: { source: string } = $props();

	// A turn is a narrow column — 384px in the side panel — so a diagram of any
	// real width arrives either shrunk or behind a scrollbar. Clicking it opens
	// the same diagram at the size of the screen, the way a chat image does.
	let enlarged = $state(false);
	const inline = createMermaidRender(
		() => source,
		() => true
	);
	const full = createMermaidRender(
		() => source,
		() => enlarged
	);
</script>

{#if inline.current.kind === 'ready'}
	<Dialog.Root bind:open={enlarged}>
		<Dialog.Trigger
			aria-label="Open diagram at full size"
			class="not-prose my-4 block w-full max-w-full cursor-zoom-in overflow-x-auto transition-opacity hover:opacity-90"
		>
			<div role="img" aria-label="Mermaid diagram">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG is sanitized with the shared Mermaid sanitizer. -->
				{@html inline.current.svg}
			</div>
		</Dialog.Trigger>
		<Dialog.Content class="dialog-fill flex flex-col sm:max-w-7xl">
			<Dialog.Title class="sr-only">Mermaid diagram</Dialog.Title>
			<Dialog.Description class="sr-only"
				>The diagram from this message, full size.</Dialog.Description
			>
			<div
				role="img"
				aria-label="Mermaid diagram at full size"
				class="flex flex-1 items-center justify-center overflow-auto [&>svg]:h-auto [&>svg]:max-w-full"
			>
				{#if full.current.kind === 'ready'}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG is sanitized with the shared Mermaid sanitizer. -->
					{@html full.current.svg}
				{:else if full.current.kind === 'failure'}
					<p class="text-sm text-muted-foreground">This diagram could not be drawn.</p>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Root>
	<Collapsible.Root>
		<Collapsible.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm">Diagram source</Button>
			{/snippet}
		</Collapsible.Trigger>
		<Collapsible.Content>
			<pre><code>{source}</code></pre>
		</Collapsible.Content>
	</Collapsible.Root>
{:else}
	{#if inline.current.kind === 'failure'}
		<p class="text-sm text-muted-foreground">
			This diagram could not be drawn. Its source is shown below.
		</p>
	{/if}
	<pre><code>{source}</code></pre>
{/if}
