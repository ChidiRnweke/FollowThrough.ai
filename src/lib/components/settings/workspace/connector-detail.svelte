<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type {
		Connector,
		ConnectorId,
		ConnectorTool,
		ConnectorToolPolicyChoice
	} from '$lib/models/connectors';
	import {
		disconnectConnector,
		getConnector,
		reconnectConnector,
		refreshConnectorTools,
		setConnectorToolPolicy
	} from '$lib/remote/connectors/connectors.remote';
	import { ConnectorLogo, ConnectorToolList, refusalMessage } from '$lib/components/connectors';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import ConfirmDelete from '$lib/components/shared/confirm-delete.svelte';
	import * as Icon from '$lib/components/icons';

	let { connectorId }: { connectorId: ConnectorId } = $props();

	/** One change at a time: a tool's server name, or the connector-wide action in flight. */
	let busy = $state<string | undefined>();

	const refreshedAt = (connector: Connector) =>
		new Date(connector.toolsRefreshedAt).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});

	async function choose(tool: ConnectorTool, policy: ConnectorToolPolicyChoice | 'default') {
		busy = tool.serverName;
		try {
			await setConnectorToolPolicy({ connectorId, serverName: tool.serverName, policy });
			// chisel-ignore fail-loudly:silent-catch -- the failure is reported and the refreshed detail still shows the stored setting.
		} catch (error) {
			toast.error(refusalMessage(error, `Could not change ${tool.title}. Try again.`));
		} finally {
			busy = undefined;
		}
	}

	async function refresh(connector: Connector) {
		busy = 'refresh';
		try {
			await refreshConnectorTools(connectorId);
			toast.success(`Refreshed ${connector.title}`);
			// chisel-ignore fail-loudly:silent-catch -- the failure is reported and the previous snapshot stays in force.
		} catch (error) {
			toast.error(refusalMessage(error, `Could not reach ${connector.title}. Try again.`));
		} finally {
			busy = undefined;
		}
	}

	/** A sign-in leaves for the service's own page; the callback returns here. */
	async function reconnect(connector: Connector) {
		busy = 'reconnect';
		try {
			const start = await reconnectConnector(connectorId);
			if (start.kind === 'authorize') {
				window.location.assign(start.authorizationUrl);
				return;
			}
			await getConnector(connectorId).refresh();
			busy = undefined;
			// chisel-ignore fail-loudly:silent-catch -- the failure is reported and the connector keeps its stated status.
		} catch (error) {
			toast.error(refusalMessage(error, `Could not open ${connector.title}. Try again.`));
			busy = undefined;
		}
	}

	async function disconnect(connector: Connector) {
		busy = 'disconnect';
		try {
			await disconnectConnector(connectorId);
			toast.success(`Disconnected ${connector.title}`);
			await goto('/settings?tab=connectors');
			// chisel-ignore fail-loudly:silent-catch -- the failure is reported and the connector stays listed.
		} catch (error) {
			toast.error(refusalMessage(error, `Could not disconnect ${connector.title}. Try again.`));
		} finally {
			busy = undefined;
		}
	}
</script>

<section class="flex max-w-3xl flex-col gap-group">
	<Button variant="ghost" size="sm" href="/settings?tab=connectors" class="-ml-2 self-start">
		<Icon.ArrowLeft />
		Connectors
	</Button>

	<svelte:boundary>
		{#snippet pending()}
			<p class="text-sm text-muted-foreground">Loading the connector…</p>
		{/snippet}
		{@const detail = await getConnector(connectorId)}
		{@const connector = detail.connector}
		<!-- Header, then a further step to the tools: the actions answer for the whole
		     connector, the toggles for one tool each. -->
		<div class="flex flex-col gap-section">
			<div class="flex flex-col gap-group">
				<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
					<ConnectorLogo logo={connector.logo} title={connector.title} size="lg" />
					<div class="flex min-w-0 flex-1 flex-col gap-bind">
						<h2 class="section-title truncate">{connector.title}</h2>
						<!-- chisel-ignore design-system:no-raw-font-family -- The server URL is a machine literal. -->
						<p class="truncate font-mono text-xs text-muted-foreground">{connector.serverUrl}</p>
					</div>
					<div class="flex shrink-0 items-center gap-2">
						<Button
							variant="outline"
							disabled={busy !== undefined || connector.status.kind !== 'connected'}
							onclick={() => void refresh(connector)}
						>
							{#if busy === 'refresh'}<Spinner />{:else}<Icon.Refresh />{/if}
							Refresh tools
						</Button>
						<ConfirmDelete
							title="Disconnect {connector.title}?"
							description="The agent loses these tools, and FollowThrough deletes the stored sign-in. Nothing in {connector.title} changes."
							confirmLabel="Disconnect"
							busy={busy === 'disconnect'}
							onconfirm={() => disconnect(connector)}
						>
							{#snippet trigger(props)}
								<Button {...props} variant="ghost" disabled={busy !== undefined}>Disconnect</Button>
							{/snippet}
						</ConfirmDelete>
					</div>
				</div>

				{#if connector.status.kind !== 'connected'}
					<Alert.Root variant="destructive">
						<Icon.Warning />
						<Alert.Title>
							{connector.status.kind === 'unreadable'
								? 'This sign-in can no longer be read'
								: 'Sign in again'}
						</Alert.Title>
						<Alert.Description>
							<p>
								{connector.status.kind === 'unreadable'
									? 'The server’s encryption keys changed since you connected. The agent cannot use these tools until you sign in again.'
									: `${connector.status.reason} The agent cannot use these tools until you sign in again.`}
							</p>
							{#if connector.authentication === 'oauth'}
								<Button
									class="mt-2"
									size="sm"
									disabled={busy !== undefined}
									onclick={() => void reconnect(connector)}
								>
									{#if busy === 'reconnect'}<Spinner />{/if}
									Sign in to {connector.title}
								</Button>
							{:else}
								<p>Disconnect it, then connect it again with a new access token.</p>
							{/if}
						</Alert.Description>
					</Alert.Root>
				{/if}
			</div>

			<div class="flex flex-col gap-row">
				<p class="text-sm text-muted-foreground">
					A tool its server marks read-only runs without asking; every other tool asks first. In
					auto-accept mode, a tool set to Ask runs without pausing, like FollowThrough’s own
					changes.
				</p>
				<div class="flex flex-col gap-bind">
					<div class="flex items-baseline justify-between gap-4">
						<h3 class="eyebrow">Tools</h3>
						<p class="provenance-caption">Refreshed {refreshedAt(connector)}</p>
					</div>
					<ConnectorToolList
						service={connector.title}
						tools={detail.tools}
						disabled={busy !== undefined}
						onchoose={(tool, policy) => void choose(tool, policy)}
					/>
				</div>
			</div>
		</div>

		{#snippet failed(error, reset)}
			<div
				role="alert"
				class="flex flex-col items-start gap-row rounded-md border border-destructive/30 bg-destructive/5 p-4"
			>
				<p class="text-sm text-destructive">
					{refusalMessage(error, 'Could not load this connector.')}
				</p>
				<Button
					variant="outline"
					size="sm"
					onclick={() => void getConnector(connectorId).refresh().then(reset, reset)}
				>
					Try again
				</Button>
			</div>
		{/snippet}
	</svelte:boundary>
</section>
