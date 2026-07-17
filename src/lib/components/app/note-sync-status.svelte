<script lang="ts">
	import type { DateTime, NoteSyncStatus } from '$lib/models';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { formatRelativeTime } from './labels';

	let {
		status,
		updatedAt,
		onRetry,
		onReview
	}: {
		status: NoteSyncStatus;
		updatedAt: DateTime;
		onRetry: () => void;
		onReview: () => void;
	} = $props();
</script>

<div class="flex items-center" aria-live="polite">
	{#if status === 'loading'}
		<span class="text-xs text-muted-foreground">Loading device copy…</span>
	{:else if status === 'saving'}
		<span class="flex items-center gap-1 text-xs text-muted-foreground">
			<Spinner /> Syncing…
		</span>
	{:else if status === 'pending'}
		<Button variant="ghost" size="xs" onclick={onRetry}>Saved on device · retry sync</Button>
	{:else if status === 'conflict'}
		<Button variant="outline" size="xs" onclick={onReview}>
			<TriangleAlert data-icon="inline-start" /> Review conflict
		</Button>
	{:else if status === 'error'}
		<Button variant="ghost" size="xs" onclick={onRetry}>Couldn’t save · retry</Button>
	{:else}
		<span class="text-xs text-muted-foreground">Saved · {formatRelativeTime(updatedAt)}</span>
	{/if}
</div>
