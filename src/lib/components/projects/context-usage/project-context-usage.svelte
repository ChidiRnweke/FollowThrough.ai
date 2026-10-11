<script lang="ts">
	import type { ProjectId } from '$lib/models/projects';
	import { getProjectContextUsage } from '$lib/remote/context-usage/context-usage.remote';
	import { userFacingMessage } from '$lib/errors';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import UsageStats from './usage-stats.svelte';
	import LookupsChart from './lookups-chart.svelte';
	import TopItemsChart from './top-items-chart.svelte';
	import CoverageChart from './coverage-chart.svelte';
	import AttentionList from './attention-list.svelte';
	import ItemLink from './item-link.svelte';
	import { kindNoun } from './kinds';

	let { projectId }: { projectId: ProjectId } = $props();

	const usage = $derived(getProjectContextUsage({ projectId }));
	const lookups = (count: number) => `${count} ${count === 1 ? 'lookup' : 'lookups'}`;
</script>

<!--
	Read top to bottom as three questions a reader can answer without knowing how the agent
	works: how is it going (the numbers and the charts), what should I fix (attention), and
	where did that come from (the full ranking and the chats).
-->
{#if usage.error}
	<p role="alert" class="text-sm text-destructive">
		{userFacingMessage(usage.error, 'Agent activity could not be loaded.')}
	</p>
{:else if !usage.current}
	<div class="flex flex-col gap-4" aria-busy="true">
		<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each [0, 1, 2, 3] as tile (tile)}<Skeleton class="h-24" />{/each}
		</div>
		<Skeleton class="h-56 w-full" />
	</div>
{:else}
	{@const summary = usage.current}
	<div class="flex flex-col gap-10">
		<UsageStats {summary} />

		<LookupsChart activity={summary.activity} />

		<div class="grid gap-8 lg:grid-cols-2">
			<TopItemsChart mostUsed={summary.mostUsed} />
			<CoverageChart coverage={summary.coverage} />
		</div>

		<AttentionList {summary} {projectId} />

		{#if summary.mostUsed.length > 0}
			<section class="flex flex-col gap-2" aria-labelledby="ranking-heading">
				<h2 id="ranking-heading" class="eyebrow">Everything it looked up</h2>
				<ul class="divide-y divide-border">
					{#each summary.mostUsed as row (`${row.item.kind}:${row.item.id}`)}
						<li class="row-interactive flex items-center gap-3 px-3 py-2.5 text-sm">
							<div class="min-w-0 flex-1"><ItemLink item={row.item} {projectId} /></div>
							<span class="shrink-0 text-xs text-muted-foreground">
								{kindNoun[row.item.kind][0]} · {lookups(row.uses)} · {formatRelativeTime(
									row.lastUsedAt
								)}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if summary.chats.length > 0}
			<section class="flex flex-col gap-2" aria-labelledby="chats-heading">
				<h2 id="chats-heading" class="eyebrow">Recent chats</h2>
				<ul class="divide-y divide-border">
					{#each summary.chats as chat (chat.conversationId)}
						<li class="row-interactive flex flex-col gap-1.5 px-3 py-2.5 text-sm">
							<div class="flex items-center gap-3">
								<a
									href="/chats/{chat.conversationId}"
									class="min-w-0 flex-1 truncate font-medium hover:underline"
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
				{summary.unreadableCalls === 1 ? 'older tool call' : 'older tool calls'} across your chats could
				not be read and {summary.unreadableCalls === 1 ? 'is' : 'are'} not counted here.
			</p>
		{/if}
	</div>
{/if}
