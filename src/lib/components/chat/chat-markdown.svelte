<script lang="ts">
	import { onMount } from 'svelte';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import DiffViewer from './diff-viewer.svelte';
	import { renderChatMarkdown } from './chat-markdown';

	let { content }: { content: string } = $props();
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});

	const segments = $derived.by((): { type: 'markdown' | 'diff'; content: string }[] => {
		if (!mounted) return [];
		const parts: { type: 'markdown' | 'diff'; content: string }[] = [];
		const pattern = /```diff\n([\s\S]*?)```/g;
		let lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content)) !== null) {
			if (match.index > lastIndex) {
				parts.push({ type: 'markdown', content: content.slice(lastIndex, match.index) });
			}
			parts.push({ type: 'diff', content: match[1].trim() });
			lastIndex = match.index + match[0].length;
		}
		if (lastIndex < content.length) {
			parts.push({ type: 'markdown', content: content.slice(lastIndex) });
		}
		return parts.length > 0 ? parts : [{ type: 'markdown', content }];
	});
</script>

<div
	class="prose prose-sm max-w-none break-words dark:prose-invert prose-pre:max-w-full prose-pre:overflow-x-auto"
>
	{#each segments as segment, index (index)}
		<!--
			The boundary is per segment, not per message: one unrenderable segment
			must not cost the reader the rest of the turn. It catches what the
			try/catch in `renderChatMarkdown` cannot — a malformed diff, or the
			`{@html}` insertion itself.
		-->
		<ErrorBoundary label="part of this message" source={segment.content}>
			{#if segment.type === 'diff'}
				<DiffViewer diffText={segment.content} />
			{:else}
				{@const rendered = renderChatMarkdown(segment.content)}
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
