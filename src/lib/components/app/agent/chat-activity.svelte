<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner';

	let { label = 'Agent is thinking', toolActive = false }: { label?: string; toolActive?: boolean } = $props();
</script>

<div class="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
	{#if toolActive}
		<Spinner />
	{:else}
		<span class="chat-thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
	{/if}
	<span>{label}</span>
</div>
