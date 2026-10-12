<script lang="ts">
	import type {
		ConnectionNode,
		ItemKey,
		ProjectConnectionsReport
	} from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import type { ChatHandoff } from '$lib/stores/agent/chat-handoff';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Icon from '$lib/components/icons';
	import ItemLink from '../item-link.svelte';
	import { kindNoun } from '../kinds';
	import ConnectionsAsk from './connections-ask.svelte';

	let {
		report,
		projectId,
		projectName,
		selected,
		open = $bindable(false),
		onselect,
		onask
	}: {
		report: ProjectConnectionsReport;
		projectId: ProjectId;
		projectName: string;
		selected: ConnectionNode;
		open?: boolean;
		onselect: (key: ItemKey) => void;
		/** Opens the chat with the question prefilled and this map pinned; never sends. */
		onask: (request: ChatHandoff, trigger: HTMLElement | undefined) => void;
	} = $props();

	const byKey = $derived(new Map(report.nodes.map((node) => [node.key, node])));
	const chats = (count: number) => `${count} ${count === 1 ? 'chat' : 'chats'}`;
	const linkLabel = (kind: string) => kind.replaceAll('_', ' ');

	/** The rows under the item: each list shows its five strongest, as the map draws them. */
	const detail = $derived.by(() => {
		const key = selected.key;
		const pairs = report.together.filter((pair) => pair.a === key || pair.b === key);
		const other = (pair: (typeof pairs)[number]) => (pair.a === key ? pair.b : pair.a);
		const first = (pair: (typeof pairs)[number]) => (pair.a === key ? pair.aFirst : pair.bFirst);
		const after = (pair: (typeof pairs)[number]) => (pair.a === key ? pair.bFirst : pair.aFirst);
		return {
			with: pairs
				.map((pair) => ({ key: other(pair), count: pair.chats }))
				.sort((a, b) => b.count - a.count),
			leadsTo: pairs
				.filter((pair) => first(pair) > 0)
				.map((pair) => ({ key: other(pair), count: first(pair) }))
				.sort((a, b) => b.count - a.count),
			readAfter: pairs
				.filter((pair) => after(pair) > 0)
				.map((pair) => ({ key: other(pair), count: after(pair) }))
				.sort((a, b) => b.count - a.count),
			linked: report.links
				.filter((link) => link.from === key || link.to === key)
				.map((link) => ({
					key: link.from === key ? link.to : link.from,
					label: link.from === key ? linkLabel(link.kind) : `${linkLabel(link.kind)} (to this)`
				}))
		};
	});
</script>

{#snippet rows(
	list: readonly { key: ItemKey; count?: number; label?: string }[],
	heading: string,
	Glyph: typeof Icon.Link
)}
	{#if list.length > 0}
		<section class="flex flex-col gap-row">
			<h3 class="flex items-center gap-2 text-sm font-medium">
				<Glyph class="size-4 shrink-0 text-muted-foreground" />{heading}
			</h3>
			<ul class="flex flex-col">
				<!-- A partner linked both ways appears once per direction, so the label is part of the key. -->
				{#each list.slice(0, 5) as row (`${row.key}|${row.label ?? ''}`)}
					{@const node = byKey.get(row.key)}
					<li class="flex min-w-0 items-center gap-2 py-1 text-sm">
						{#if node}
							<Button
								variant="link"
								size="xs"
								class="h-auto min-w-0 flex-1 justify-start truncate p-0 text-sm font-normal text-foreground"
								onclick={() => onselect(row.key)}>{node.item.title}</Button
							>
						{/if}
						<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
							{row.count !== undefined ? chats(row.count) : row.label}
						</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="flex max-h-dvh flex-col gap-group overflow-y-auto sm:max-w-md">
		<Dialog.Header>
			<!-- The item and what you can ask about it share a row, as on a note's header. -->
			<div class="flex min-w-0 items-center justify-between gap-2">
				<Dialog.Title class="min-w-0"><ItemLink item={selected.item} {projectId} /></Dialog.Title>
				<ConnectionsAsk {report} {projectId} {projectName} {selected} {onask} />
			</div>
			<Dialog.Description>
				{kindNoun[selected.item.kind][0]} ·
				{selected.use.kind === 'never'
					? 'never read by the agent'
					: `read ${selected.use.times} ${selected.use.times === 1 ? 'time' : 'times'} in ${chats(selected.chats)} · last ${formatRelativeTime(selected.use.lastAt)}`}
			</Dialog.Description>
		</Dialog.Header>
		{@render rows(detail.with, 'Read with', Icon.ReadTogether)}
		{@render rows(detail.leadsTo, 'Leads the agent to', Icon.LeadsTo)}
		{@render rows(detail.readAfter, 'Read after', Icon.ReadAfter)}
		{@render rows(detail.linked, 'Linked', Icon.Link)}
		{#if detail.with.length === 0 && detail.linked.length === 0}
			<p class="text-sm text-muted-foreground">Read on its own so far.</p>
		{/if}
	</Dialog.Content>
</Dialog.Root>
