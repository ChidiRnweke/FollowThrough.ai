<script lang="ts">
	import CloudCheck from '@lucide/svelte/icons/cloud-check';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import CloudUpload from '@lucide/svelte/icons/cloud-upload';
	import CloudDownload from '@lucide/svelte/icons/cloud-download';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { syncIndicator } from '$lib/models/sync';
	import type { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import WorkspaceWriteReview from '$lib/components/shared/workspace-write-review.svelte';
	let {
		resources,
		startupFailure = null
	}: { resources: WorkspaceResources; startupFailure?: string | null } = $props();
	let review = $state(false);
	const indicator = $derived(
		syncIndicator({
			online: resources.online,
			pending: resources.pending.length,
			sending: resources.pending.some((entry) => entry.delivery.kind === 'sending'),
			review:
				resources.pending.filter(
					(entry) =>
						entry.delivery.kind === 'conflict' ||
						entry.delivery.kind === 'rejected' ||
						entry.delivery.kind === 'retry'
				).length + resources.recoveryItems.filter((item) => item.impact.kind !== 'cache').length,
			failedDownloads: resources.failedDownloads,
			downloading:
				!resources.downloadProgress.inventoryComplete ||
				resources.downloadProgress.completed < resources.downloadProgress.total,
			failure:
				startupFailure ??
				(resources.readStatus.kind === 'failure'
					? resources.readStatus.message
					: resources.writeStatus.kind === 'failure'
						? resources.writeStatus.message
						: null)
		})
	);
	const Icon = $derived(
		{
			synced: CloudCheck,
			offline: CloudOff,
			saving: CloudUpload,
			downloading: CloudDownload,
			attention: TriangleAlert
		}[indicator.kind]
	);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				class="relative"
				aria-label={`Sync status: ${indicator.headline}`}
			>
				<Icon
					class={indicator.kind === 'attention'
						? 'text-destructive'
						: indicator.kind === 'saving'
							? 'motion-safe:animate-pulse'
							: ''}
				/>
				{#if indicator.badge}<Badge
						variant="secondary"
						class="absolute -top-1 -right-1 min-w-5 origin-top-right scale-75 px-1"
						>{indicator.badge}</Badge
					>{/if}
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-72">
		<DropdownMenu.Label class="pb-1 text-sm font-medium text-foreground"
			>{indicator.headline}</DropdownMenu.Label
		>
		<p class="px-2 pb-3 text-label text-muted-foreground" role="status">{indicator.description}</p>
		{#if indicator.kind === 'downloading'}<p class="px-2 pb-3 text-sm text-muted-foreground">
				{resources.downloadProgress.completed} of {resources.downloadProgress.total} known items downloaded{resources
					.downloadProgress.inventoryComplete
					? '.'
					: '; checking for more…'}
			</p>{/if}
		<DropdownMenu.Group>
			<DropdownMenu.Item onclick={() => (review = true)}>Review changes</DropdownMenu.Item>
			{#if resources.online && indicator.kind !== 'synced'}<DropdownMenu.Item
					onclick={() =>
						void (startupFailure
							? workspaceSession.synchronize(true)
							: resources.synchronize(true))}>Retry now</DropdownMenu.Item
				>{/if}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
<WorkspaceWriteReview {resources} bind:open={review} />
