<script lang="ts">
	import type { ApiToken, ApiTokenScope } from '$lib/models';
	import { toast } from 'svelte-sonner';
	import { createApiToken, listApiTokens, revokeApiToken } from '$lib/remote/settings.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import EmptyState from '$lib/components/app/empty-state.svelte';
	import KeyRound from '@lucide/svelte/icons/key-round';

	let { endpoint }: { endpoint: string } = $props();

	let name = $state('');
	let scope = $state<ApiTokenScope>('read');
	let busy = $state(false);
	/** Shown once after minting — the server cannot return it again. */
	let plaintext = $state<string | null>(null);

	const scopeLabels: Record<ApiTokenScope, string> = {
		read: 'Read only',
		full: 'Full access'
	};

	function selectScope(next: string | string[]): void {
		if (next !== 'read' && next !== 'full') return;
		scope = next;
	}

	async function mint(): Promise<void> {
		if (name.trim().length === 0) return;
		busy = true;
		try {
			const minted = await createApiToken({ name: name.trim(), scope });
			plaintext = minted.plaintext;
			name = '';
			toast.success('Token created. Copy it now — it will not be shown again.');
		} catch {
			toast.error('Could not create the token. Try again.');
		} finally {
			busy = false;
		}
	}

	async function revoke(token: ApiToken): Promise<void> {
		busy = true;
		try {
			await revokeApiToken(token.id);
			toast.success(`Revoked ${token.name}`);
		} catch {
			toast.error('Could not revoke the token. Try again.');
		} finally {
			busy = false;
		}
	}

	async function copy(value: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(value);
			toast.success('Copied to clipboard');
		} catch {
			toast.error('Could not copy. Select the text and copy manually.');
		}
	}

	const formatted = (value?: string): string =>
		value ? new Date(value).toLocaleDateString() : 'Never';
</script>

<!-- The panel runs a step looser than the other tabs (32px between blocks): three
     control-heavy blocks at 24px read as one crowd. The preamble keeps the shared
     32px step to the first block, and the token area — data under controls, a
     different kind of thing — takes a further step. Empty tokens get the shared
     centered empty state. -->
<section class="flex max-w-3xl flex-col gap-8">
	<p class="text-sm text-muted-foreground">
		Run this workspace headless from Claude Desktop or any MCP client. Tokens authenticate as you; a
		read-only token cannot change anything.
	</p>

	<Field.Group>
		<Field.Field orientation="responsive">
			<Field.Content>
				<Field.Title>Endpoint</Field.Title>
				<Field.Description>Point your MCP client at this URL.</Field.Description>
			</Field.Content>
			<div class="flex items-center gap-2">
				<Input readonly value={endpoint} class="font-mono text-sm" aria-label="MCP endpoint" />
				<Button variant="outline" onclick={() => void copy(endpoint)}>Copy</Button>
			</div>
		</Field.Field>
	</Field.Group>

	<!-- New token reads as its own block: the title row carries the scope and the
	     action, and the name input sits underneath at full width — the responsive
	     field cramming all three controls beside the text was unreadable. -->
	<div class="flex flex-col gap-6">
		<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
			<Field.Content>
				<Field.Title>New token</Field.Title>
				<Field.Description>
					Name it after the client you will paste it into, so you know what you are revoking later.
				</Field.Description>
			</Field.Content>
			<div class="flex items-center gap-2">
				<ToggleGroup.Root
					type="single"
					variant="outline"
					value={scope}
					disabled={busy}
					onValueChange={selectScope}
					aria-label="Token scope"
				>
					<ToggleGroup.Item value="read">Read only</ToggleGroup.Item>
					<ToggleGroup.Item value="full">Full access</ToggleGroup.Item>
				</ToggleGroup.Root>
				<Button onclick={() => void mint()} disabled={busy || name.trim().length === 0}>
					Create token
				</Button>
			</div>
		</div>
		<Input bind:value={name} placeholder="Claude Desktop" aria-label="Token name" disabled={busy} />
	</div>

	{#if plaintext}
		<div class="space-y-2 rounded-md border border-brand/40 bg-brand/10 p-4 dark:bg-brand/15">
			<p class="text-sm font-medium">Copy this token now</p>
			<p class="text-sm text-muted-foreground">
				It is stored hashed and cannot be shown again. If you lose it, revoke it and create another.
			</p>
			<div class="flex items-center gap-2">
				<Input readonly value={plaintext} class="font-mono text-sm" />
				<Button variant="outline" onclick={() => void copy(plaintext!)}>Copy</Button>
				<Button variant="ghost" onclick={() => (plaintext = null)}>Done</Button>
			</div>
		</div>
	{/if}

	<div class="pt-2">
		<svelte:boundary>
			{#snippet pending()}
				<p class="text-sm text-muted-foreground">Loading tokens…</p>
			{/snippet}
			{@const tokens = await listApiTokens()}
			{#if tokens.length === 0}
				<EmptyState
					icon={KeyRound}
					title="No tokens yet."
					hint="Create one above to connect a client."
					size="large"
				/>
			{:else}
				<div class="flex flex-col gap-1.5">
					<h3 class="eyebrow">Tokens</h3>
					<ul class="divide-y divide-border border-t border-border">
						{#each tokens as token (token.id)}
							<li class="row-interactive flex items-center justify-between gap-4 py-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium">{token.name}</p>
									<p class="provenance-caption">
										Created {formatted(token.createdAt)} · Last used {formatted(token.lastUsedAt)}
									</p>
								</div>
								<div class="flex shrink-0 items-center gap-2">
									<Badge variant={token.scope === 'full' ? 'brand' : 'secondary'}>
										{scopeLabels[token.scope]}
									</Badge>
									<Button variant="ghost" disabled={busy} onclick={() => void revoke(token)}>
										Revoke
									</Button>
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</svelte:boundary>
	</div>
</section>
