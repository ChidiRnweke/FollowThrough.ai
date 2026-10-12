<script lang="ts">
	import type { ChatUsage } from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Pagination from '$lib/components/ui/pagination';
	import * as Icon from '$lib/components/icons';
	import ItemLink from './item-link.svelte';

	let { chats, projectId }: { chats: readonly ChatUsage[]; projectId: ProjectId } = $props();

	/** Five rows a page: a page reads at a glance, and the pager says how many more there are. */
	const PAGE_SIZE = 5;
	let page = $state(1);
	const start = $derived((page - 1) * PAGE_SIZE);
	const visible = $derived(chats.slice(start, start + PAGE_SIZE));

	/**
	 * The newest chat opens to show what it read, as an example of what a row holds; the rest stay
	 * one line until asked. A row the reader toggled keeps its state across pages.
	 */
	let toggled = $state<Record<string, boolean>>({});
	const isOpen = (chat: ChatUsage) =>
		toggled[chat.conversationId] ?? chat.conversationId === chats[0]?.conversationId;
	const items = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;
</script>

<section class="flex flex-col gap-item" aria-labelledby="chats-heading">
	<h2 id="chats-heading" class="section-title flex items-baseline gap-2">
		Recent chats
		<span class="text-sm font-normal text-muted-foreground tabular-nums">{chats.length}</span>
	</h2>
	<ul class="divide-y divide-border">
		{#each visible as chat (chat.conversationId)}
			<li class="py-1">
				<Collapsible.Root
					open={isOpen(chat)}
					onOpenChange={(open) => (toggled[chat.conversationId] = open)}
				>
					<div class="flex items-center gap-2 text-sm">
						<Collapsible.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon-sm"
									aria-label="Show what {chat.title ?? 'this chat'} read"
									class="shrink-0 text-muted-foreground [&[data-state=open]>svg]:rotate-90"
								>
									<Icon.ChevronRight class="size-4 transition-transform" />
								</Button>
							{/snippet}
						</Collapsible.Trigger>
						<a href="/chats/{chat.conversationId}" class="min-w-0 flex-1 truncate hover:underline"
							>{chat.title ?? 'Untitled chat'}</a
						>
						<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
							{items(chat.items.length)} · {formatRelativeTime(chat.lastUsedAt)}
						</span>
					</div>
					<Collapsible.Content>
						<ul class="flex flex-wrap gap-x-4 gap-y-1 pb-2 pl-10 text-xs text-muted-foreground">
							{#each chat.items as item (`${item.kind}:${item.id}`)}
								<li class="max-w-full min-w-0"><ItemLink {item} {projectId} /></li>
							{/each}
						</ul>
					</Collapsible.Content>
				</Collapsible.Root>
			</li>
		{/each}
	</ul>
	{#if chats.length > PAGE_SIZE}
		<div class="flex flex-wrap items-center justify-between gap-3 pt-1">
			<p class="provenance-caption">{start + 1}–{start + visible.length} of {chats.length}</p>
			<!-- Pagination.Root centres itself by default; pulled right of the range. -->
			<Pagination.Root class="mx-0 w-auto" count={chats.length} perPage={PAGE_SIZE} bind:page>
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
</section>
