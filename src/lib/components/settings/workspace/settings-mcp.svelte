<script lang="ts">
	import type { McpConnection, McpScope } from '$lib/models/identity';
	import { toast } from 'svelte-sonner';
	import { listMcpConnections, revokeMcpConnection } from '$lib/remote/settings/settings.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import EmptyState from '$lib/components/shared/empty-state.svelte';
	import * as Scene from '$lib/components/icons/scenes';

	let { endpoint }: { endpoint: string } = $props();

	let busy = $state(false);

	const scopeLabels: Record<McpScope, string> = {
		read: 'Read only',
		full: 'Full access'
	};

	async function revoke(connection: McpConnection): Promise<void> {
		busy = true;
		try {
			await revokeMcpConnection(connection.id);
			toast.success(`Disconnected ${connection.clientName}`);
			// chisel-ignore fail-loudly:silent-catch -- revocation failure is reported and the connection remains listed.
		} catch {
			toast.error('Could not disconnect the app. Try again.');
		} finally {
			busy = false;
		}
	}

	async function copy(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			toast.success('Copied to clipboard');
			// chisel-ignore fail-loudly:silent-catch -- the endpoint remains selectable and the toast gives the manual-copy recovery.
		} catch {
			toast.error('Could not copy. Select the text and copy manually.');
		}
	}

	const formatted = (value?: string): string =>
		value ? new Date(value).toLocaleDateString() : 'Never';

	/** A metadata document URL names the client's host; a registration id names nothing. */
	const origin = (clientId: string): string =>
		clientId.startsWith('https://') ? new URL(clientId).host : 'Registered client';
</script>

<!-- The endpoint is the only setup step: a client that is given it signs in through the
     browser and asks for consent, so there is nothing to create here. Connections — data
     under a control — take a further step, as the token list did. -->
<section class="flex max-w-3xl flex-col gap-section">
	<p class="text-sm text-muted-foreground">
		Run this workspace headless from Claude, Cursor or any MCP client. Add the endpoint to the
		client; it opens your browser to sign in and asks you to approve it. A read-only connection
		cannot change anything.
	</p>

	<Field.Group>
		<Field.Field orientation="responsive">
			<Field.Content>
				<Field.Title>Endpoint</Field.Title>
				<Field.Description>Add this URL to your MCP client as a remote server.</Field.Description>
			</Field.Content>
			<div class="flex items-center gap-2">
				<!-- chisel-ignore design-system:no-raw-font-family -- The MCP endpoint is a copy-paste machine literal. -->
				<Input readonly value={endpoint} class="font-mono text-sm" aria-label="MCP endpoint" />
				<Button variant="outline" onclick={() => void copy(endpoint)}>Copy</Button>
			</div>
		</Field.Field>
	</Field.Group>

	<div class="pt-2">
		<svelte:boundary>
			{#snippet pending()}
				<p class="text-sm text-muted-foreground">Loading connected apps…</p>
			{/snippet}
			{@const connections = await listMcpConnections()}
			{#if connections.length === 0}
				<EmptyState
					scene={Scene.Key}
					title="No connected apps yet."
					hint="Add the endpoint to a client to connect it."
					size="large"
				/>
			{:else}
				<div class="flex flex-col gap-bind">
					<h3 class="eyebrow">Connected apps</h3>
					<ul class="divide-y divide-border border-t border-border">
						{#each connections as connection (connection.id)}
							<li class="row-interactive flex items-center justify-between gap-4 py-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium">{connection.clientName}</p>
									<p class="provenance-caption">
										{origin(connection.clientId)} · Connected {formatted(connection.createdAt)} · Last
										used {formatted(connection.lastUsedAt)}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<Badge variant={connection.scope === 'full' ? 'brand' : 'secondary'}>
										{scopeLabels[connection.scope]}
									</Badge>
									<Button variant="ghost" disabled={busy} onclick={() => void revoke(connection)}>
										Disconnect
									</Button>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#snippet failed(_error, reset)}
				<div
					role="alert"
					class="flex flex-col items-start gap-row rounded-md border border-destructive/30 bg-destructive/5 p-4"
				>
					<p class="text-sm text-destructive">Could not load connected apps.</p>
					<!-- Refresh the query before resetting. A repeated failure returns to this notice. -->
					<Button
						variant="outline"
						size="sm"
						onclick={() => void listMcpConnections().refresh().then(reset, reset)}
					>
						Try again
					</Button>
				</div>
			{/snippet}
		</svelte:boundary>
	</div>
</section>
