<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PendingMemoryNotification } from '$lib/models/memory';
	import type { ScheduledAttention, ScheduledRunNotice } from '$lib/models/schedules';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Tip } from '$lib/components/ui/tooltip';
	import { cn, mergeProps } from '$lib/utils';
	import * as Icon from '$lib/components/icons';
	import { Increases } from '$lib/hooks/increases.svelte';
	import { openConversationSurface } from '$lib/client/shell/responsive-surfaces';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { markScheduledRunOpened } from '$lib/remote/schedules/schedules.remote';
	import { toast } from 'svelte-sonner';

	// The one bell: everything that needs the user, in the order it needs them. A scheduled run
	// that waits for approval comes first, then runs that finished unopened, then memory to review.
	let {
		notifications,
		scheduled,
		class: className,
		side = 'bottom'
	}: {
		notifications: readonly PendingMemoryNotification[];
		scheduled: ScheduledAttention;
		class?: string;
		/** `right` from the sidebar's icon rail; `bottom` from the mobile header. */
		side?: 'bottom' | 'right';
	} = $props();

	const total = $derived(
		scheduled.waiting.length +
			scheduled.finished.length +
			notifications.reduce((sum, notification) => sum + notification.count, 0)
	);
	// An arrival swings the bell once. The count a page loads with is not an arrival.
	const arrivals = new Increases(() => total);

	async function markAllRead(): Promise<void> {
		const result = await workspaceSession.serverChange(
			Promise.all(
				scheduled.finished.map((notice) =>
					markScheduledRunOpened({ occurrenceId: notice.occurrenceId })
				)
			)
		);
		if (result.kind === 'failure') toast.error(result.message);
	}
</script>

{#snippet run(notice: ScheduledRunNotice)}
	<DropdownMenu.Item
		class="items-start"
		onclick={() => openConversationSurface(notice.conversationId)}
	>
		<Icon.Scheduled class="mt-0.5 text-brand" />
		<span class="flex min-w-0 flex-1 flex-col gap-bind">
			<span class="flex items-baseline justify-between gap-2">
				<span class="truncate font-medium">{notice.title}</span>
				<span class="provenance-caption shrink-0 tabular-nums">{notice.ranAt}</span>
			</span>
			<span class="line-clamp-2 text-xs text-muted-foreground">{notice.line}</span>
		</span>
	</DropdownMenu.Item>
{/snippet}

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props: menuProps })}
			<Tip text="Waiting for you" side={side === 'right' ? 'right' : 'top'}>
				{#snippet children({ props: tipProps })}
					<Button
						{...mergeProps(menuProps, tipProps)}
						variant="ghost"
						size="icon-sm"
						class={cn('relative', className)}
						aria-label={total === 0 ? 'Nothing is waiting for you' : `${total} waiting for you`}
					>
						{#key arrivals.count}<Icon.Notifications
								class={arrivals.count > 0 ? 'ft-ring' : undefined}
							/>{/key}
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
	<DropdownMenu.Content {side} align={side === 'right' ? 'start' : 'end'} class="w-80">
		{#if total === 0}
			<DropdownMenu.Group>
				<DropdownMenu.Item disabled>Nothing is waiting for you.</DropdownMenu.Item>
			</DropdownMenu.Group>
		{/if}
		{#if scheduled.waiting.length > 0}
			<DropdownMenu.Label>Waiting for you</DropdownMenu.Label>
			<DropdownMenu.Group>
				{#each scheduled.waiting as notice (notice.occurrenceId)}{@render run(notice)}{/each}
			</DropdownMenu.Group>
		{/if}
		{#if scheduled.finished.length > 0}
			<DropdownMenu.Label>Finished while you were away</DropdownMenu.Label>
			<DropdownMenu.Group>
				{#each scheduled.finished as notice (notice.occurrenceId)}{@render run(notice)}{/each}
			</DropdownMenu.Group>
		{/if}
		{#if notifications.length > 0}
			<DropdownMenu.Label>Memory to review</DropdownMenu.Label>
			<DropdownMenu.Group>
				{#each notifications as notification (notification.href)}
					<DropdownMenu.Item onclick={() => void goto(notification.href)}>
						<span class="min-w-0 flex-1 truncate">{notification.label}</span>
						<Badge variant="secondary">{notification.count}</Badge>
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Group>
		{/if}
		{#if scheduled.finished.length > 0}
			<DropdownMenu.Separator />
			<DropdownMenu.Group>
				<DropdownMenu.Item onclick={() => void markAllRead()}>
					<Icon.CheckAll />Mark finished runs as read
				</DropdownMenu.Item>
			</DropdownMenu.Group>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
