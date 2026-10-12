<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import { getProjectConnections } from '$lib/remote/context-usage/context-usage.remote';
	import { userFacingMessage } from '$lib/errors';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ConnectionsMap from './connections-map.svelte';

	let { projectId }: { projectId: ProjectId } = $props();

	const connections = $derived(getProjectConnections({ projectId }));
</script>

{#if connections.error}
	<p role="alert" class="text-sm text-destructive">
		{userFacingMessage(connections.error, 'Connections could not be loaded.')}
	</p>
{:else if !connections.current}
	<div class="grid gap-section lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy="true">
		<Skeleton class="aspect-[18/13] w-full" />
		<div class="flex flex-col gap-row">
			<Skeleton class="h-6 w-48" /><Skeleton class="h-24 w-full" />
		</div>
	</div>
{:else if connections.current.nodes.length === 0}
	<p class="text-sm text-muted-foreground">
		The agent hasn't read anything here yet, and nothing here is linked. Ask about this project in a
		chat, and what it reads together shows up here.
	</p>
{:else}
	<!-- Keyed, so a refreshed report starts the map from its own default threshold. -->
	{#key connections.current}
		<ConnectionsMap report={connections.current} {projectId} />
	{/key}
{/if}
