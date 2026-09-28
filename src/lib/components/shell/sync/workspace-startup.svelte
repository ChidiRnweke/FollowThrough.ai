<script lang="ts">
	import type { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
	import type { WorkspaceReadiness } from '$lib/models/workspace-startup';
	import { workspaceSession } from '$lib/stores/workspace/session.svelte';
	import { Button } from '$lib/components/ui/button';
	import CloudDownload from '@lucide/svelte/icons/cloud-download';
	import WorkspaceRecoveryDownload from '$lib/components/shared/workspace-recovery-download.svelte';
	let {
		resources,
		readiness,
		startupFailure
	}: {
		resources: WorkspaceResources;
		readiness: WorkspaceReadiness;
		startupFailure: string | null;
	} = $props();
	const failure = $derived(
		readiness.kind === 'failure'
			? readiness.message
			: (startupFailure ??
					(resources.readStatus.kind === 'failure' ? resources.readStatus.message : null))
	);
</script>

<div
	class="flex flex-1 flex-col items-center justify-center gap-4 p-6 md:p-8 text-center"
	data-workspace-startup
>
	<CloudDownload class="size-6 text-muted-foreground" />
	<div class="space-y-2" role="status">
		<p class="text-sm font-medium">
			{failure
				? 'Workspace download paused'
				: !resources.online
					? 'Workspace download is offline'
					: 'Downloading your workspace…'}
		</p>
		<p class="max-w-prose text-sm text-muted-foreground">
			{failure ??
				(!resources.online
					? 'Reconnect to continue. Downloaded items remain available in the sidebar.'
					: 'Your projects and notes appear in the sidebar as they arrive.')}
		</p>
	</div>
	<p class="text-sm tabular-nums text-muted-foreground">
		{resources.downloadProgress.completed} items downloaded
	</p>
	{#if resources.online && !failure}
		<div class="h-1 w-32 overflow-hidden rounded-full bg-muted" aria-hidden="true">
			<div class="h-full bg-primary motion-safe:animate-pulse"></div>
		</div>
	{:else if resources.online}
		<Button variant="outline" onclick={() => void workspaceSession.synchronize(true)}
			>Retry download</Button
		>
	{/if}
	{#if !resources.active}<WorkspaceRecoveryDownload />{/if}
</div>
