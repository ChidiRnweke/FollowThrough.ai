<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import { getProjectConnections } from '$lib/remote/context-usage/context-usage.remote';
	import { userFacingMessage } from '$lib/errors';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ConnectionsMap from './connections-map.svelte';

	let { projectId, projectName }: { projectId: ProjectId; projectName: string } = $props();

	const connections = $derived(getProjectConnections({ projectId }));
</script>

{#if connections.error}
	<p role="alert" class="text-sm text-destructive">
		{userFacingMessage(connections.error, 'Connections could not be loaded.')}
	</p>
{:else if !connections.current}
	<Skeleton class="aspect-[18/13] max-h-128 w-full" aria-busy="true" />
{:else if connections.current.nodes.length === 0}
	<p class="text-sm text-muted-foreground">
		The agent hasn't read anything here yet, and nothing here is linked. Ask about this project in a
		chat, and what it reads together shows up here.
	</p>
{:else}
	<!-- Keyed, so a refreshed report starts the map from its own default threshold. -->
	{#key connections.current}
		<ConnectionsMap report={connections.current} {projectId} {projectName} />
	{/key}
{/if}
