<script lang="ts">
	let { svg, alt, class: className = '' }: { svg: string; alt: string; class?: string } = $props();
	let previewUrl = $state('');

	$effect(() => {
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
		previewUrl = url;
		return () => URL.revokeObjectURL(url);
	});
</script>

{#if previewUrl}
	<img src={previewUrl} {alt} class={className} />
{/if}
