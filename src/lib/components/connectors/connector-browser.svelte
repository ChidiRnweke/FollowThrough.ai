<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { connectRequestSchema, type ConnectRequest } from '$lib/models/connectors';
	import { connectConnector, connectorCatalog } from '$lib/remote/connectors/connectors.remote';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Field from '$lib/components/ui/field';
	import { Form } from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import * as Icon from '$lib/components/icons';
	import ConnectorCatalog from './connector-catalog.svelte';
	import { refusalMessage } from './refusal';

	let { open = $bindable(false) }: { open: boolean } = $props();

	/** The entry or form being connected: one at a time, because a sign-in leaves the page. */
	let connecting = $state<string | undefined>();
	let refusal = $state<string | undefined>();

	let serverUrl = $state('');
	let title = $state('');
	let signIn = $state<'discover' | 'token'>('discover');
	let token = $state('');

	/** The same schema the server parses with, so the button is enabled exactly when it would accept. */
	const custom = $derived(
		connectRequestSchema.safeParse({
			kind: 'custom',
			serverUrl: serverUrl.trim(),
			title,
			authentication: signIn === 'token' ? { kind: 'token', token } : { kind: 'discover' }
		})
	);

	/** Pressing the pressed item reports `''`; the group keeps showing the current choice. */
	function selectSignIn(next: string): void {
		if (next === 'discover' || next === 'token') signIn = next;
	}

	/**
	 * A server that needs a sign-in answers with its authorization page, and the
	 * browser leaves for it; the callback brings the user back to the connector.
	 * One that needs none is connected already.
	 */
	async function connect(request: ConnectRequest, key: string, name: string): Promise<void> {
		connecting = key;
		refusal = undefined;
		try {
			const start = await connectConnector(request);
			if (start.kind === 'authorize') {
				window.location.assign(start.authorizationUrl);
				return;
			}
			open = false;
			connecting = undefined;
			toast.success(`Connected ${name}`);
			await goto(`/settings?tab=connectors&connector=${start.connectorId}`);
			// chisel-ignore fail-loudly:silent-catch -- the refusal is shown in the dialog's alert and nothing is connected.
		} catch (error) {
			refusal = refusalMessage(error, `Could not connect ${name}. Try again.`);
			connecting = undefined;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-3xl" data-connector-browser>
		<Dialog.Header>
			<Dialog.Title>Add a connector</Dialog.Title>
			<Dialog.Description>
				The agent reaches each service through its MCP server. You sign in at the service itself;
				FollowThrough stores the sign-in encrypted and never shows it again.
			</Dialog.Description>
		</Dialog.Header>
		{#if refusal}
			<Alert.Root variant="destructive">
				<Icon.Error />
				<Alert.Title>Not connected</Alert.Title>
				<Alert.Description>{refusal}</Alert.Description>
			</Alert.Root>
		{/if}
		<Tabs.Root value="catalog">
			<Tabs.List>
				<Tabs.Trigger value="catalog">Catalog</Tabs.Trigger>
				<Tabs.Trigger value="custom">Custom server</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="catalog">
				<svelte:boundary>
					{#snippet pending()}
						<p class="py-6 text-sm text-muted-foreground">Loading the catalog…</p>
					{/snippet}
					<ConnectorCatalog
						catalog={await connectorCatalog()}
						{connecting}
						onconnect={(view) =>
							void connect(
								{ kind: 'catalog', catalogId: view.entry.id },
								view.entry.id,
								view.entry.title
							)}
						onopen={() => (open = false)}
					/>

					{#snippet failed(_error, reset)}
						<div role="alert" class="flex flex-col items-start gap-row py-6">
							<p class="text-sm text-destructive">Could not load the catalog.</p>
							<Button
								variant="outline"
								size="sm"
								onclick={() => void connectorCatalog().refresh().then(reset, reset)}
							>
								Try again
							</Button>
						</div>
					{/snippet}
				</svelte:boundary>
			</Tabs.Content>
			<Tabs.Content value="custom">
				<Form
					class="flex flex-col gap-group pt-2"
					onsubmit={(event) => {
						event.preventDefault();
						if (custom.success) void connect(custom.data, 'custom', title.trim());
					}}
				>
					<Field.Group>
						<Field.Field>
							<Field.Label for="connector-url">Server URL</Field.Label>
							<Input
								id="connector-url"
								type="url"
								bind:value={serverUrl}
								placeholder="https://mcp.example.com/mcp"
								autocomplete="off"
								disabled={connecting !== undefined}
							/>
							<Field.Description>
								A remote MCP server over HTTPS. FollowThrough never reaches a private network
								address.
							</Field.Description>
						</Field.Field>
						<Field.Field>
							<Field.Label for="connector-title">Name</Field.Label>
							<Input
								id="connector-title"
								bind:value={title}
								placeholder="Team docs"
								autocomplete="off"
								disabled={connecting !== undefined}
							/>
						</Field.Field>
						<Field.Field>
							<Field.Label id="connector-sign-in">Sign-in</Field.Label>
							<ToggleGroup.Root
								type="single"
								variant="outline"
								bind:value={() => signIn, selectSignIn}
								disabled={connecting !== undefined}
								aria-labelledby="connector-sign-in"
							>
								<ToggleGroup.Item value="discover">Ask the server</ToggleGroup.Item>
								<ToggleGroup.Item value="token">Access token</ToggleGroup.Item>
							</ToggleGroup.Root>
							<Field.Description>
								{signIn === 'discover'
									? 'A server that needs a sign-in sends you to its own page; one that needs none connects at once.'
									: 'Paste a token the service issued. It is sent as a bearer token and cannot be renewed.'}
							</Field.Description>
						</Field.Field>
						{#if signIn === 'token'}
							<Field.Field>
								<Field.Label for="connector-token">Access token</Field.Label>
								<Input
									id="connector-token"
									type="password"
									bind:value={token}
									autocomplete="off"
									disabled={connecting !== undefined}
								/>
							</Field.Field>
						{/if}
					</Field.Group>
					<div class="flex justify-end">
						<Button type="submit" disabled={!custom.success || connecting !== undefined}>
							{#if connecting === 'custom'}
								<Spinner />
							{/if}
							Connect
						</Button>
					</div>
				</Form>
			</Tabs.Content>
		</Tabs.Root>
	</Dialog.Content>
</Dialog.Root>
