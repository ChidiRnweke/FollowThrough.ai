<script lang="ts">
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Form } from '$lib/components/ui/form';
	import * as Field from '$lib/components/ui/field';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import BrandMark from '$lib/components/shared/brand-mark.svelte';
	import type { McpScope } from '$lib/models/identity';

	let { data, form } = $props();

	// The requested scope only seeds the choice; the user's choice is what is submitted.
	// svelte-ignore state_referenced_locally
	let scope = $state<McpScope>(
		data.outcome.kind === 'consent' ? data.outcome.requestedScope : 'read'
	);

	const scopes: readonly { value: McpScope; title: string; description: string }[] = [
		{
			value: 'read',
			title: 'Read only',
			description: 'Search and read your workspace. It cannot change anything.'
		},
		{
			value: 'full',
			title: 'Full access',
			description: 'Read and change your workspace, like the in-app agent.'
		}
	];

	/** Keeps the request in the URL: each action reviews it again on the server. */
	const action = (name: 'approve' | 'deny'): string => `${page.url.search}&/${name}`;
</script>

<svelte:head>
	<title>Connect an app · FollowThrough</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-6 py-16">
	<div class="flex w-full max-w-lg flex-col gap-section">
		{#if data.outcome.kind === 'consent'}
			{@const outcome = data.outcome}
			<header class="flex flex-col gap-group">
				<BrandMark class="size-10" />
				<div class="flex flex-col gap-row">
					<h1 class="page-title">Connect {outcome.clientName}?</h1>
					<p class="text-base text-foreground">
						{outcome.clientName}{#if outcome.vouchedBy}, published by
							<span class="font-medium">{outcome.vouchedBy}</span>,{/if} will work in your workspace as
						you, through the MCP tools you have enabled.
					</p>
				</div>
			</header>

			{#if !outcome.vouchedBy}
				<!-- A self-registered app chose its own name; nothing vouches for it. -->
				<Alert.Root>
					<Alert.Title>Unverified app</Alert.Title>
					<Alert.Description>
						It registered itself, so its name cannot be confirmed. Connect it only if you just added
						FollowThrough to it.
					</Alert.Description>
				</Alert.Root>
			{/if}

			<Form method="POST" class="flex flex-col gap-section">
				<Field.Set class="gap-0">
					<Field.Legend class="mb-row section-title font-semibold">Access</Field.Legend>
					<RadioGroup.Root name="scope" bind:value={scope}>
						{#each scopes as option (option.value)}
							<Field.Label
								for="scope-{option.value}"
								class="text-sm text-foreground dark:has-[[data-state=checked]]:border-brand/50"
							>
								<Field.Field orientation="horizontal">
									<Field.Content>
										<Field.Title class="font-semibold text-foreground">{option.title}</Field.Title>
										<Field.Description class="text-sm">{option.description}</Field.Description>
									</Field.Content>
									<RadioGroup.Item value={option.value} id="scope-{option.value}" />
								</Field.Field>
							</Field.Label>
						{/each}
					</RadioGroup.Root>
				</Field.Set>

				<div class="flex flex-col gap-row">
					{#if form?.description}
						<Alert.Root variant="destructive">
							<Alert.Title>The app was not connected</Alert.Title>
							<Alert.Description>{form.description}</Alert.Description>
						</Alert.Root>
					{/if}
					<div class="flex gap-2">
						<Button type="submit" size="lg" formaction={action('approve')}>Connect</Button>
						<!-- Refusing ends the client's attempt, so a stray click is confirmed first. -->
						<AlertDialog.Root>
							<AlertDialog.Trigger>
								{#snippet child({ props })}
									<Button {...props} type="button" size="lg" variant="outline">Cancel</Button>
								{/snippet}
							</AlertDialog.Trigger>
							<AlertDialog.Content>
								<AlertDialog.Header>
									<AlertDialog.Title>Don't connect {outcome.clientName}?</AlertDialog.Title>
									<AlertDialog.Description>
										{outcome.clientName} will not get access. To connect it later, start again from the
										app.
									</AlertDialog.Description>
								</AlertDialog.Header>
								<AlertDialog.Footer>
									<AlertDialog.Cancel>Keep connecting</AlertDialog.Cancel>
									<Button type="submit" form="deny-request">Don't connect</Button>
								</AlertDialog.Footer>
							</AlertDialog.Content>
						</AlertDialog.Root>
					</div>
				</div>
			</Form>
			<!-- The confirmation dialog renders outside the consent form, so refusal has its own. -->
			<Form id="deny-request" method="POST" action={action('deny')} class="hidden" />
		{:else}
			<header class="flex flex-col gap-group">
				<BrandMark class="size-10" />
				<div class="flex flex-col gap-row">
					<h1 class="page-title">This app cannot connect</h1>
					<p class="text-base text-foreground">
						Nothing was shared with it. Start again from the app.
					</p>
				</div>
			</header>
			<Alert.Root variant="destructive">
				<Alert.Title>The request was refused</Alert.Title>
				<Alert.Description>{data.outcome.description}</Alert.Description>
			</Alert.Root>
		{/if}
	</div>
</main>
