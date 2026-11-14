<script lang="ts">
	import type { ConnectorStatus, ConnectorsOverview } from '$lib/models/connectors';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import * as Icon from '$lib/components/icons';
	import * as Scene from '$lib/components/icons/scenes';
	import ConnectorLogo from './connector-logo.svelte';
	import { toolCountsCaption } from './tool-counts';

	let {
		overview,
		onbrowse
	}: {
		overview: ConnectorsOverview;
		/** Opens the catalog; the one action the list offers. */
		onbrowse: () => void;
	} = $props();

	const hostOf = (serverUrl: string) => new URL(serverUrl).host;

	/** A connector that cannot run says so on its row; a working one paints nothing. */
	const statusLabel = (status: ConnectorStatus): string | undefined =>
		status.kind === 'reauthorization_required'
			? 'Sign in again'
			: status.kind === 'unreadable'
				? 'Connect again'
				: undefined;
</script>

{#snippet browse()}
	<Button onclick={onbrowse}>
		<Icon.Plus />
		Add connector
	</Button>
{/snippet}

{#if overview.kind === 'unconfigured'}
	<EmptyState
		scene={Scene.Unlinked}
		title="Connectors are not set up on this server."
		hint="Sign-ins are stored encrypted, and this server has no key to encrypt them with. Ask whoever runs it to set CONNECTOR_SECRET_KEYS."
		size="large"
	/>
{:else if overview.connectors.length === 0}
	<EmptyState
		scene={Scene.Unlinked}
		title="Nothing connected yet."
		hint="Connect Linear, GitHub, Notion or your own MCP server, and the agent can work there."
		size="large"
	>
		{#snippet action()}
			{@render browse()}
		{/snippet}
	</EmptyState>
{:else}
	<!-- The action shares the heading's row, so the row takes an item step to the list:
	     at the bind step the button sat on the first hairline. -->
	<div class="flex flex-col gap-item">
		<div class="flex items-center justify-between gap-4">
			<h3 class="eyebrow">Connected</h3>
			{@render browse()}
		</div>
		<ul class="divide-y divide-border border-t border-border">
			{#each overview.connectors as summary (summary.connector.id)}
				{@const connector = summary.connector}
				{@const status = statusLabel(connector.status)}
				<li>
					<a
						href="/settings?tab=connectors&connector={connector.id}"
						class="row-interactive flex items-center gap-3 py-3"
					>
						<ConnectorLogo logo={connector.logo} title={connector.title} />
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{connector.title}</p>
							<p class="provenance-caption truncate">
								{hostOf(connector.serverUrl)} · {toolCountsCaption(summary.tools)}
							</p>
						</div>
						{#if status}
							<Badge variant="destructive" class="shrink-0">
								<Icon.Warning />
								{status}
							</Badge>
						{/if}
						<Icon.ChevronRight class="size-4 shrink-0 text-muted-foreground" />
					</a>
				</li>
			{/each}
		</ul>
	</div>
{/if}
