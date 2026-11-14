<script lang="ts">
	import { listConnectors } from '$lib/remote/connectors/connectors.remote';
	import { ConnectorBrowser, ConnectorList } from '$lib/components/connectors';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';

	let {
		failure
	}: {
		/** Why the last sign-in did not connect, as the callback reported it. */
		failure: string | undefined;
	} = $props();

	let browsing = $state(false);
</script>

<!-- The same ladder as MCP access: a preamble, a step to the block below. A callback
     failure sits between them, because it answers the last thing the user did. -->
<section class="flex max-w-3xl flex-col gap-section">
	<p class="text-sm text-muted-foreground">
		Connect the services you work in, and the agent can read and act there too. A tool the service
		marks read-only runs without asking; every other tool asks first, unless you choose otherwise.
	</p>

	{#if failure}
		<Alert.Root variant="destructive">
			<Icon.Error />
			<Alert.Title>Not connected</Alert.Title>
			<Alert.Description>{failure}</Alert.Description>
		</Alert.Root>
	{/if}

	<svelte:boundary>
		{#snippet pending()}
			<p class="text-sm text-muted-foreground">Loading connectors…</p>
		{/snippet}
		<ConnectorList overview={await listConnectors()} onbrowse={() => (browsing = true)} />

		{#snippet failed(_error, reset)}
			<div
				role="alert"
				class="flex flex-col items-start gap-row rounded-md border border-destructive/30 bg-destructive/5 p-4"
			>
				<p class="text-sm text-destructive">Could not load connectors.</p>
				<Button
					variant="outline"
					size="sm"
					onclick={() => void listConnectors().refresh().then(reset, reset)}
				>
					Try again
				</Button>
			</div>
		{/snippet}
	</svelte:boundary>
</section>

<ConnectorBrowser bind:open={browsing} />
