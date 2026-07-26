<script lang="ts">
	import type { ApiToken, ApiTokenScope } from '$lib/models';
	import { toast } from 'svelte-sonner';
	import { createApiToken, listApiTokens, revokeApiToken } from '$lib/remote/settings.remote';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import * as Select from '$lib/components/ui/select';

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

<section class="space-y-4">
	<p class="text-sm text-muted-foreground">
		Run this workspace headless from Claude Desktop or any MCP client. Tokens authenticate as you; a
		read-only token cannot change anything.
	</p>

	<div class="space-y-1">
		<Label for="mcp-endpoint">Endpoint</Label>
		<div class="flex items-center gap-2">
			<Input id="mcp-endpoint" readonly value={endpoint} class="font-mono text-sm" />
			<Button variant="outline" onclick={() => void copy(endpoint)}>Copy</Button>
		</div>
	</div>

	<Field.Group class="max-w-3xl">
		<Field.Field orientation="responsive">
			<Field.Content>
				<Field.Title>New token</Field.Title>
				<Field.Description>
					Name it after the client you will paste it into, so you know what you are revoking later.
				</Field.Description>
			</Field.Content>
			<div class="flex flex-wrap items-center gap-2">
				<Input
					bind:value={name}
					placeholder="Claude Desktop"
					aria-label="Token name"
					disabled={busy}
				/>
				<Select.Root type="single" bind:value={scope}>
					<Select.Trigger class="w-40" aria-label="Token scope">
						{scopeLabels[scope]}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="read" label={scopeLabels.read}>Read only</Select.Item>
						<Select.Item value="full" label={scopeLabels.full}>Full access</Select.Item>
					</Select.Content>
				</Select.Root>
				<Button onclick={() => void mint()} disabled={busy || name.trim().length === 0}>
					Create token
				</Button>
			</div>
		</Field.Field>
	</Field.Group>

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

	<svelte:boundary>
		{#snippet pending()}
			<p class="text-sm text-muted-foreground">Loading tokens…</p>
		{/snippet}
		{@const tokens = await listApiTokens()}
		{#if tokens.length === 0}
			<p class="text-sm text-muted-foreground">No tokens yet.</p>
		{:else}
			<ul class="divide-y">
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
		{/if}
	</svelte:boundary>
</section>
