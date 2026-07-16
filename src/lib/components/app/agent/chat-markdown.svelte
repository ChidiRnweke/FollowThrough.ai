<script lang="ts">
	import { onMount } from 'svelte';
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';

	let { content }: { content: string } = $props();
	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});

	const html = $derived.by(() => {
		if (!mounted) return '';
		const rendered = marked.parse(content, { async: false, breaks: true, gfm: true });
		return DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } });
	});
</script>

<div
	class="prose prose-sm max-w-none break-words dark:prose-invert prose-pre:max-w-full prose-pre:overflow-x-auto"
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- Marked output is sanitized by DOMPurify above. -->
	{@html html}
</div>
