<script lang="ts">
	import type { ScheduledRunView } from '$lib/models/schedules';
	import type { ConversationId } from '$lib/models/agent';
	import { Badge } from '$lib/components/ui/badge';
	import * as Pagination from '$lib/components/ui/pagination';
	import * as Icon from '$lib/components/icons';

	let {
		runs,
		onopen
	}: {
		/** Newest first. */
		runs: readonly ScheduledRunView[];
		onopen: (conversationId: ConversationId) => void;
	} = $props();

	/** Five rows a page, as every paginated list here: a page reads at a glance. */
	const PAGE_SIZE = 5;
	let page = $state(1);
	const start = $derived((page - 1) * PAGE_SIZE);
	const visible = $derived(runs.slice(start, start + PAGE_SIZE));
</script>

<!--
	The heading sits a `row` step above its list, as on the project overview. The page puts a
	`section` step above the heading, so the heading belongs to the rows under it.
-->
<section class="flex flex-col gap-row" aria-labelledby="schedule-runs-heading">
	<h2 id="schedule-runs-heading" class="section-title flex items-baseline gap-2">
		Runs
		<span class="text-sm font-normal text-muted-foreground tabular-nums">{runs.length}</span>
	</h2>
	{#if runs.length === 0}
		<p class="text-sm text-muted-foreground">No runs yet. The first one lands here.</p>
	{:else}
		<!-- Bled 12px past the measure: the row text keeps the page's left edge, and the hover
		     wash and the hairlines have room around it. -->
		<ul class="-mx-3 divide-y divide-border border-y border-border">
			{#each visible as run (run.occurrence.id)}
				{@const fresh = run.state.kind === 'finished' && !run.state.opened}
				{@const failed = run.state.kind === 'finished' && run.state.outcome === 'failed'}
				<li>
					<!-- A link, so the chat also opens in a new tab; a plain click shows it beside this page. -->
					<a
						href="/chats/{run.occurrence.conversationId}"
						class="row-interactive flex items-center gap-3 px-3 py-3"
						onclick={(event) => {
							if (event.metaKey || event.ctrlKey || event.shiftKey) return;
							event.preventDefault();
							onopen(run.occurrence.conversationId);
						}}
					>
						<span class="flex min-w-0 flex-1 flex-col gap-bind">
							<span
								class={[
									'truncate text-sm tabular-nums',
									fresh || run.state.kind === 'waiting' ? 'font-semibold' : 'font-medium'
								]}>{run.ranAt}</span
							>
							<span
								class={[
									'flex min-w-0 items-center gap-1 text-xs',
									failed ? 'text-destructive' : 'text-muted-foreground'
								]}
							>
								{#if failed}<Icon.Warning class="size-3.5 shrink-0" />{/if}
								<span class="truncate">{run.line}</span>
							</span>
						</span>
						{#if run.state.kind === 'waiting'}
							<Badge variant="brand" class="shrink-0"><Icon.Pause />Waiting for you</Badge>
						{:else if run.state.kind === 'working'}
							<Badge variant="secondary" class="shrink-0">Running</Badge>
						{:else if fresh}
							<Badge variant="brand" class="shrink-0">New</Badge>
						{/if}
						<Icon.ChevronRight class="size-4 shrink-0 text-muted-foreground" />
					</a>
				</li>
			{/each}
		</ul>
		{#if runs.length > PAGE_SIZE}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p class="provenance-caption">{start + 1}–{start + visible.length} of {runs.length}</p>
				<!-- Pagination.Root centres itself by default; pulled right of the range. -->
				<Pagination.Root class="mx-0 w-auto" count={runs.length} perPage={PAGE_SIZE} bind:page>
					{#snippet children({ pages, currentPage })}
						<Pagination.Content>
							<Pagination.Item><Pagination.Previous /></Pagination.Item>
							{#each pages as entry (entry.key)}
								<Pagination.Item>
									{#if entry.type === 'ellipsis'}
										<Pagination.Ellipsis />
									{:else}
										<Pagination.Link page={entry} isActive={currentPage === entry.value}
											>{entry.value}</Pagination.Link
										>
									{/if}
								</Pagination.Item>
							{/each}
							<Pagination.Item><Pagination.Next /></Pagination.Item>
						</Pagination.Content>
					{/snippet}
				</Pagination.Root>
			</div>
		{/if}
	{/if}
</section>
