<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import type { ProjectId } from '$lib/models/projects';
	import { getProjectContextUsage } from '$lib/remote/context-usage/context-usage.remote';
	import { userFacingMessage } from '$lib/errors';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Icon from '$lib/components/icons';
	import OverviewHero from './overview-hero.svelte';
	import UsageOverTimeChart from './usage-over-time-chart.svelte';
	import TopItemsChart from './top-items-chart.svelte';
	import CoverageChart from './coverage-chart.svelte';
	import AttentionTab from './attention-tab.svelte';
	import ItemLink from './item-link.svelte';
	import { kindNoun } from './kinds';

	let { projectId }: { projectId: ProjectId } = $props();

	const usage = $derived(getProjectContextUsage({ projectId }));

	type Tab = 'overview' | 'attention';
	/** `?tab=attention` opens the second tab, so a link can point straight at what needs fixing. */
	let tab = $state<Tab>(
		page.url.searchParams.get('tab') === 'attention' ? 'attention' : 'overview'
	);
	const show = (next: Tab) => {
		tab = next;
		const url = new URL(page.url);
		if (next === 'attention') url.searchParams.set('tab', 'attention');
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
		<Skeleton class="h-9 w-64" />
		<div class="flex items-center gap-12">
			<Skeleton class="size-52 rounded-full" />
			<div class="flex flex-col gap-row">
				<Skeleton class="h-10 w-40" /><Skeleton class="h-8 w-48" />
			</div>
		</div>
		<Skeleton class="h-64 w-full" />
	</div>
{:else}
	{@const summary = usage.current}
	{@const attention =
		summary.missedSearches.length + summary.hiddenAttachments.length + summary.neverUsed.length}
	<Tabs.Root
		value={tab}
		onValueChange={(value) => show(value === 'attention' ? 'attention' : 'overview')}
	>
		<Tabs.List variant="line" class="mb-8">
			<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
			<Tabs.Trigger value="attention" class="gap-2">
				Needs attention
				{#if attention > 0}
					<!-- Teal is the live thing: a dot says "something is here", the count says how much. -->
					<span class="inline-flex items-center gap-1.5 text-foreground tabular-nums">
						<span class="size-1.5 rounded-full bg-primary" aria-hidden="true"></span>
						{attention}
						<span class="sr-only">{attention === 1 ? 'item' : 'items'} need attention</span>
					</span>
				{:else}
					<Icon.Success class="size-4 text-muted-foreground" aria-label="Nothing needs attention" />
				{/if}
			</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="overview">
			<div class="flex flex-col gap-section">
				<OverviewHero {summary} {attention} onattention={() => show('attention')} />

				<UsageOverTimeChart activity={summary.activity} />

				<div class="grid gap-section lg:grid-cols-2">
					<div class="flex flex-col gap-row">
						<TopItemsChart mostUsed={summary.mostUsed} />
						{#if summary.mostUsed.length > 0}
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
											Show all {summary.mostUsed.length} items
										</Button>
									{/snippet}
								</Collapsible.Trigger>
								<Collapsible.Content>
									<ul class="divide-y divide-border">
										{#each summary.mostUsed as row (`${row.item.kind}:${row.item.id}`)}
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
					<CoverageChart coverage={summary.coverage} />
				</div>

				{#if summary.chats.length > 0}
					<section class="flex flex-col gap-item" aria-labelledby="chats-heading">
						<h2 id="chats-heading" class="section-title">Recent chats</h2>
						<ul class="divide-y divide-border">
							{#each summary.chats as chat (chat.conversationId)}
								<li class="row-interactive flex flex-col gap-bind px-3 py-2.5 text-sm">
									<div class="flex items-center gap-3">
										<a
											href="/chats/{chat.conversationId}"
											class="min-w-0 flex-1 truncate hover:underline"
											>{chat.title ?? 'Untitled chat'}</a
										>
										<span class="shrink-0 text-xs text-muted-foreground"
											>{formatRelativeTime(chat.lastUsedAt)}</span
										>
									</div>
									<ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
										{#each chat.items as item (`${item.kind}:${item.id}`)}
											<li class="max-w-full min-w-0"><ItemLink {item} {projectId} /></li>
										{/each}
									</ul>
								</li>
							{/each}
						</ul>
					</section>
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

		<Tabs.Content value="attention">
			<AttentionTab {summary} {projectId} />
		</Tabs.Content>
	</Tabs.Root>
{/if}
