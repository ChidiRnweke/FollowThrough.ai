<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PendingMemoryNotification } from '$lib/models';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from '$lib/utils';
	import Bell from '@lucide/svelte/icons/bell';

	let {
		notifications
	}: {
		notifications: readonly PendingMemoryNotification[];
	} = $props();

	const total = $derived(notifications.reduce((sum, notification) => sum + notification.count, 0));
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props: menuProps })}
			<Tip text="Pending memories">
				{#snippet children({ props: tipProps })}
					<Button
						{...mergeProps(menuProps, tipProps)}
						variant="ghost"
						size="icon-sm"
						class="relative"
						aria-label={total === 0
							? 'Memory notifications'
							: `${total} pending memory suggestions`}
					>
						<Bell />
						{#if total > 0}
							<Badge
								variant="secondary"
								class="absolute -top-1 -right-1 min-w-5 origin-top-right scale-75 px-1"
							>
								{total}
							</Badge>
						{/if}
					</Button>
				{/snippet}
			</Tip>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-64">
		<DropdownMenu.Label>Pending memories</DropdownMenu.Label>
		<DropdownMenu.Group>
			{#if notifications.length === 0}
				<DropdownMenu.Item disabled>No pending memory suggestions</DropdownMenu.Item>
			{:else}
				{#each notifications as notification (notification.href)}
					<DropdownMenu.Item onclick={() => void goto(notification.href)}>
						<span class="min-w-0 flex-1 truncate">{notification.label}</span>
						<Badge variant="secondary">{notification.count}</Badge>
					</DropdownMenu.Item>
				{/each}
			{/if}
		</DropdownMenu.Group>
	</DropdownMenu.Content>
</DropdownMenu.Root>
