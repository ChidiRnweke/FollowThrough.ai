<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import type { ProjectId } from '$lib/models/projects';
	import { getProjectContextUsage } from '$lib/remote/context-usage/context-usage.remote';
	import { userFacingMessage } from '$lib/errors';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Icon from '$lib/components/icons';
	import OverviewHero from './overview-hero.svelte';
	import WhatToDo from './what-to-do.svelte';
	import UsageOverTimeChart from './usage-over-time-chart.svelte';
	import TopItemsChart from './top-items-chart.svelte';
	import RecentChats from './recent-chats.svelte';
	import ItemLink from './item-link.svelte';
	import { kindNoun } from './kinds';
	import ConnectionsTab from './connections/connections-tab.svelte';

	let { projectId, projectName }: { projectId: ProjectId; projectName: string } = $props();

	const usage = $derived(getProjectContextUsage({ projectId }));

	type Tab = 'overview' | 'connections';
	/** `?tab=connections` opens the map, so a link can point straight at it. */
	let tab = $state<Tab>(
		page.url.searchParams.get('tab') === 'connections' ? 'connections' : 'overview'
	);
	const show = (next: Tab) => {
		tab = next;
		const url = new URL(page.url);
		if (next === 'connections') url.searchParams.set('tab', 'connections');
		else url.searchParams.delete('tab');
		// Replace, not push: switching tabs is looking, not navigating.
		replaceState(url, page.state);
	};

	const times = (count: number) => `read ${count} ${count === 1 ? 'time' : 'times'}`;
	let rankingOpen = $state(false);
</script>

{#if usage.error}
	<p role="alert" class="text-sm text-destructive">
		{userFacingMessage(usage.error, 'Agent activity could not be loaded.')}
	</p>
{:else if !usage.current}
	<div class="flex flex-col gap-group" aria-busy="true">
		<Skeleton class="h-12 w-32" />
		<Skeleton class="h-5 w-96" />
		<Skeleton class="h-1.5 w-full" />
		<Skeleton class="h-56 w-full" />
	</div>
{:else}
	{@const summary = usage.current}
	{@const toFix =
		summary.missedSearches.length +
		summary.hiddenAttachments.length +
		(summary.neverUsed.length > 0 ? 1 : 0)}
	<!--
		Project memory loads into every chat on its own, so ranking it beside what the agent chose to
		read says nothing; it leaves the ranking and is named once beneath it.
	-->
	{@const ranked = summary.mostUsed.filter((row) => row.item.kind !== 'memory')}
	{@const memoryRead = summary.mostUsed.length - ranked.length}
	<Tabs.Root
		value={tab}
		onValueChange={(value) => show(value === 'connections' ? 'connections' : 'overview')}
	>
		<Tabs.List variant="line" class="mb-8">
			<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
			<Tabs.Trigger value="connections">Connections</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="overview">
			<div class="flex flex-col gap-section">
				<div class="flex flex-col gap-group">
					<OverviewHero {summary} {projectName} {toFix} />
					<WhatToDo {summary} {projectId} count={toFix} />
				</div>

				<div class="grid gap-section lg:grid-cols-2">
					<UsageOverTimeChart activity={summary.activity} />
					<div class="flex min-w-0 flex-col gap-row">
						<TopItemsChart mostUsed={ranked} />
						{#if memoryRead > 0}
							<p class="text-xs text-muted-foreground">
								Project memory ({memoryRead}
								{memoryRead === 1 ? 'entry' : 'entries'}) loads into every chat, so it is left out
								of this ranking.
							</p>
						{/if}
						{#if ranked.length > 0}
							<Collapsible.Root bind:open={rankingOpen}>
								<Collapsible.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="ghost"
											size="sm"
											class="-ml-2 w-fit gap-1.5 text-muted-foreground [&[data-state=open]>svg]:rotate-90"
										>
											<Icon.ChevronRight class="size-4 transition-transform" />
											All {ranked.length} items
										</Button>
									{/snippet}
								</Collapsible.Trigger>
								<Collapsible.Content>
									<ul class="divide-y divide-border">
										{#each ranked as row (`${row.item.kind}:${row.item.id}`)}
											<li class="row-interactive flex items-center gap-3 px-3 py-2 text-sm">
												<div class="min-w-0 flex-1"><ItemLink item={row.item} {projectId} /></div>
												<span class="shrink-0 text-xs text-muted-foreground">
													{kindNoun[row.item.kind][0]} · {times(row.uses)} · {formatRelativeTime(
														row.lastUsedAt
													)}
												</span>
											</li>
										{/each}
									</ul>
								</Collapsible.Content>
							</Collapsible.Root>
						{/if}
					</div>
				</div>

				{#if summary.chats.length > 0}
					<RecentChats chats={summary.chats} {projectId} />
				{/if}

				{#if summary.unreadableCalls > 0}
					<p class="text-xs text-muted-foreground">
						{summary.unreadableCalls}
						{summary.unreadableCalls === 1 ? 'older tool call' : 'older tool calls'} across your chats
						could not be read and {summary.unreadableCalls === 1 ? 'is' : 'are'} not counted here.
					</p>
				{/if}
			</div>
		</Tabs.Content>
		<Tabs.Content value="connections">
			<ConnectionsTab {projectId} {projectName} />
		</Tabs.Content>
	</Tabs.Root>
{/if}
