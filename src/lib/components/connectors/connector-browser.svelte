<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import {
		connectRequestSchema,
		type CatalogEntryView,
		type ConnectRequest
	} from '$lib/models/connectors';
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
	import ConnectorLogo from './connector-logo.svelte';
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

	/** A ghost button stretched into a tile, as in the widget picker. */
	const tileClass =
		'flex h-auto w-full items-start justify-start gap-3 p-3 text-left font-normal whitespace-normal';

	const caption = (view: CatalogEntryView): string => {
		if (view.availability.kind === 'connected') return 'Connected';
		if (view.availability.kind === 'unconfigured') return 'Not available on this server';
		return view.entry.authentication.kind === 'none'
			? 'No sign-in needed'
			: `Sign in with ${view.entry.title}`;
	};
</script>

{#snippet tile(view: CatalogEntryView)}
	<ConnectorLogo logo={{ kind: 'catalog', catalogId: view.entry.id }} title={view.entry.title} />
	<span class="flex min-w-0 flex-1 flex-col gap-bind">
		<span class="text-sm font-medium">{view.entry.title}</span>
		<span class="text-sm text-muted-foreground">{view.entry.description}</span>
		<span class="provenance-caption">
			{#if connecting === view.entry.id}
				Opening {view.entry.title}…
			{:else}
				{caption(view)}
			{/if}
		</span>
	</span>
	{#if connecting === view.entry.id}
		<Spinner class="shrink-0" />
	{:else if view.availability.kind === 'connected'}
		<Icon.Check class="size-4 shrink-0 text-muted-foreground" />
	{/if}
{/snippet}

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
					{@const catalog = await connectorCatalog()}
					<!-- Tiles rest flat and take the hover wash, like the widget picker: the logos
					     already give the grid its structure. -->
					<ul class="grid max-h-112 grid-cols-1 gap-item overflow-y-auto pr-3 sm:grid-cols-2">
						{#each catalog as view (view.entry.id)}
							<li>
								{#if view.availability.kind === 'connected'}
									<Button
										variant="ghost"
										class={tileClass}
										href="/settings?tab=connectors&connector={view.availability.connectorId}"
										onclick={() => (open = false)}
									>
										{@render tile(view)}
									</Button>
								{:else}
									<Button
										variant="ghost"
										class={tileClass}
										disabled={view.availability.kind === 'unconfigured' || connecting !== undefined}
										aria-label="Connect {view.entry.title}"
										onclick={() =>
											void connect(
												{ kind: 'catalog', catalogId: view.entry.id },
												view.entry.id,
												view.entry.title
											)}
									>
										{@render tile(view)}
									</Button>
								{/if}
							</li>
						{/each}
					</ul>

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
