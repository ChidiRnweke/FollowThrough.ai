<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Form } from '$lib/components/ui/form';
	import { Tip } from '$lib/components/ui/tooltip';
	import {
		FtChevronsUd as ChevronsUpDown,
		FtProfile as UserRound,
		FtSettings as Settings
	} from '$lib/components/icons';
	import LogOut from '@lucide/svelte/icons/log-out';

	let { displayName, email }: { displayName: string; email: string } = $props();

	// `/auth/logout` is POST-only (it clears the server session, then redirects to
	// the login page), so signing out has to submit rather than follow a link — an
	// `<a href>` here would 405 and look like nothing happened.
	//
	// The form sits at the component root rather than inside `DropdownMenu.Content`
	// because the content is portalled and unmounted the moment an item is chosen;
	// submitting a node that is being torn down is a race. Here it is always mounted
	// and the item just asks it to submit.
	// `Form` rather than a raw `<form>`: the architecture audit bans the bare element
	// outside the allowed component folders. `src/routes/waiting/+page.svelte` signs
	// out through the same component.
	let signOutForm = $state<HTMLFormElement | null>(null);
</script>

<Form method="POST" action="/auth/logout" class="hidden" bind:ref={signOutForm} />

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Tip text={email} side="top">
				{#snippet children({ props: tipProps })}
					<Button
						variant="ghost"
						{...props}
						{...tipProps}
						type="button"
						class="tactile flex h-8 w-full min-w-0 items-center justify-start gap-2 rounded-md px-2 text-sm font-normal group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
						aria-label="Account menu for {displayName}"
					>
						<UserRound class="size-4 shrink-0 text-muted-foreground" />
						<span class="truncate group-data-[collapsible=icon]:hidden">{displayName}</span>
						<ChevronsUpDown
							class="ml-auto size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
						/>
					</Button>
				{/snippet}
			</Tip>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" side="top" class="min-w-56">
		<DropdownMenu.Label class="flex min-w-0 flex-col">
			<span class="truncate text-sm font-medium">{displayName}</span>
			<span class="truncate text-xs font-normal text-muted-foreground">{email}</span>
		</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a href="/profile" {...props}>
					<UserRound class="size-4" />
					Profile
				</a>
			{/snippet}
		</DropdownMenu.Item>
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a href="/settings" {...props}>
					<Settings class="size-4" />
					Settings
				</a>
			{/snippet}
		</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Item variant="destructive" onclick={() => signOutForm?.requestSubmit()}>
			<LogOut class="size-4" />
			Sign out
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
