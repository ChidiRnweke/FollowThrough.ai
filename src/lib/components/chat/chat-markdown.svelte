<script lang="ts">
	import { onMount } from 'svelte';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import DiffViewer from './diff-viewer.svelte';
	import ChatMermaid from './chat-mermaid.svelte';
	import { chatMarkdownSegments, renderMarkdown } from '$lib/models/markdown';

	let { content, surface = 'neutral' }: { content: string; surface?: 'neutral' | 'brand' } =
		$props();
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});

	const segments = $derived(mounted ? chatMarkdownSegments(content) : []);
</script>

<!--
	Quoted material is the one thing in a turn that is not the agent's own voice, so it reads as
	borrowed rather than as emphasis: the hairline rail and muted text already used for an
	anchor quote in `suggestion-card.svelte` and `provenance-dot.svelte`. Typography's own
	blockquote — heavier rail, italic, curly quotes bolted on — is decoration on prose that is
	already set apart by position, and italics cost legibility at this size.
-->
<div
	data-surface={surface}
	class="prose prose-sm max-w-none break-words dark:prose-invert prose-pre:max-w-full prose-pre:overflow-x-auto prose-blockquote:border-l-2 prose-blockquote:border-border prose-blockquote:pl-2 prose-blockquote:font-normal {surface ===
	'brand'
		? 'prose-blockquote:text-brand-muted-foreground'
		: 'prose-blockquote:text-muted-foreground'} prose-blockquote:not-italic [&_blockquote_p:first-of-type::before]:content-none [&_blockquote_p:last-of-type::after]:content-none"
>
	{#each segments as segment, index (index)}
		<!--
			The boundary is per segment, not per message: one unrenderable segment
			must not cost the reader the rest of the turn. It catches what the
			try/catch in `renderMarkdown` cannot — a malformed diff, or the
			`{@html}` insertion itself.
		-->
		<ErrorBoundary label="part of this message" source={segment.content}>
			{#if segment.type === 'diff'}
				<DiffViewer diffText={segment.content} />
			{:else if segment.type === 'mermaid'}
				<ChatMermaid source={segment.content} />
			{:else}
				{@const rendered = renderMarkdown(segment.content)}
				{#if rendered.ok}
					{#if rendered.html}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -- Marked output is sanitized by DOMPurify above. -->
						{@html rendered.html}
					{/if}
				{:else}
					<!-- No retry offered: nothing has changed to retry against, and the
					     next streamed chunk re-runs the parse on its own. -->
					<pre class="whitespace-pre-wrap">{rendered.raw}</pre>
				{/if}
			{/if}
		</ErrorBoundary>
	{/each}
</div>
