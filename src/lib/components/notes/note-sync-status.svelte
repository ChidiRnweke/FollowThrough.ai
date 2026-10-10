<script lang="ts">
	import { online } from 'svelte/reactivity/window';
	import type { DateTime } from '$lib/models/workspace';
	import type { DraftStatus } from '$lib/models/outbox';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Tip } from '$lib/components/ui/tooltip';
	import { FtWarning as TriangleAlert } from '$lib/components/icons';
	import { formatRelativeTime } from '../shared/labels';

	let {
		status,
		updatedAt,
		reason,
		onRetry,
		onReview
	}: {
		status: DraftStatus;
		updatedAt: DateTime;
		/** Why the last sync attempt failed, surfaced on hover so "retry" is not a bare guess. */
		reason?: string;
		onRetry: () => void;
		onReview: () => void;
	} = $props();

	const explanation = $derived.by(() => {
		if (status === 'pending')
			return 'This note is saved on your device. It syncs to the server when you are back online.';
		if (status === 'conflict')
			return 'This note changed elsewhere since you started editing. Choose which version to keep.';
		if (status === 'error')
			return reason
				? `The note could not be synchronized: ${reason}`
				: 'The note could not be synchronized. Your work is still here — retry to send it.';
		return '';
	});
</script>

<div class="flex items-center" aria-live="polite">
	{#if status === 'loading'}
		<span class="text-xs text-muted-foreground">Loading device copy…</span>
	{:else if status === 'saving' || (status === 'pending' && online.current)}
		<!-- A queued write while online is about to be sent, not stuck: it reads as
		     syncing. Only an offline queue waits on the user. -->
		<span class="flex items-center gap-1 text-xs text-muted-foreground">
			<Spinner /> Syncing…
		</span>
	{:else if status === 'pending'}
		<Tip text={explanation}>
			{#snippet children({ props })}
				<Button {...props} variant="ghost" size="xs" onclick={onRetry}>
					Saved on device · retry sync
				</Button>
			{/snippet}
		</Tip>
	{:else if status === 'conflict'}
		<Tip text={explanation}>
			{#snippet children({ props })}
				<Button {...props} variant="outline" size="xs" onclick={onReview}>
					<TriangleAlert data-icon="inline-start" /> Review conflict
				</Button>
			{/snippet}
		</Tip>
	{:else if status === 'error'}
		<Tip text={explanation}>
			{#snippet children({ props })}
				<Button {...props} variant="ghost" size="xs" class="text-destructive" onclick={onRetry}>
					Couldn’t save · retry
				</Button>
			{/snippet}
		</Tip>
	{:else}
		<span class="text-xs text-muted-foreground">Saved · {formatRelativeTime(updatedAt)}</span>
	{/if}
</div>
