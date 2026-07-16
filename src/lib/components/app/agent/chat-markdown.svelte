<script lang="ts">
	import { onMount } from 'svelte';
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';
	import DiffViewer from './diff-viewer.svelte';

	let {
		content,
		onapplydiff
	}: {
		content: string;
		onapplydiff?: (diffText: string) => void;
	} = $props();
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

	function renderMarkdown(text: string): string {
		if (!mounted || !text.trim()) return '';
		const rendered = marked.parse(text, { async: false, breaks: true, gfm: true });
		return DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } });
	}
</script>

<div
	class="prose prose-sm max-w-none break-words dark:prose-invert prose-pre:max-w-full prose-pre:overflow-x-auto"
>
	{#each segments as segment, index (index)}
		{#if segment.type === 'diff'}
			<DiffViewer diffText={segment.content} onapply={onapplydiff} />
		{:else}
			{@const html = renderMarkdown(segment.content)}
			{#if html}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- Marked output is sanitized by DOMPurify above. -->
				{@html html}
			{/if}
		{/if}
	{/each}
</div>
