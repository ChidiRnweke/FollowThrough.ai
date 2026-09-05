<script lang="ts">
	import { mode } from 'mode-watcher';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Button } from '$lib/components/ui/button';

	let { source }: { source: string } = $props();
	let result = $state<{ kind: 'pending' } | { kind: 'ready'; svg: string } | { kind: 'failure' }>({
		kind: 'pending'
	});

	$effect(() => {
		const text = source;
		const dark = mode.current === 'dark';
		let cancelled = false;
		result = { kind: 'pending' };
		void (async () => {
			try {
				const { initializeMermaid, renderMermaidOffscreen, sanitizeMermaidSvg } =
					await import('$lib/components/edra/mermaid-rendering');
				if (cancelled) return;
				initializeMermaid(dark);
				const svg = await renderMermaidOffscreen(`chat-mermaid-${crypto.randomUUID()}`, text);
				if (!cancelled) result = { kind: 'ready', svg: sanitizeMermaidSvg(svg) };
				// audit-allow: silent-catch — failure renders a visible explanation and the original diagram source below.
			} catch {
				if (!cancelled) result = { kind: 'failure' };
			}
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

{#if result.kind === 'ready'}
	<div class="not-prose my-4 max-w-full overflow-x-auto" role="img" aria-label="Mermaid diagram">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG is sanitized with the shared Mermaid sanitizer. -->
		{@html result.svg}
	</div>
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
	{#if result.kind === 'failure'}
		<p class="text-sm text-muted-foreground">
			This diagram could not be drawn. Its source is shown below.
		</p>
	{/if}
	<pre><code>{source}</code></pre>
{/if}
