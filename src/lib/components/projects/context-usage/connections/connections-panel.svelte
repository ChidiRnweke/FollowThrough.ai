<script lang="ts">
	import type {
		ConnectionNode,
		ItemKey,
		ProjectConnectionsReport
	} from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import { askAgent } from '$lib/client/shell/responsive-surfaces';
	import { formatRelativeTime } from '$lib/components/shared/labels';
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';
	import { AgentAction, agentActions } from '$lib/components/agent';
	import ItemLink from '../item-link.svelte';
	import { kindNoun } from '../kinds';

	export type Mismatch = 'linked-never-together' | 'together-not-linked';

	let {
		report,
		projectId,
		selected,
		mismatch,
		onselect,
		onmismatch
	}: {
		report: ProjectConnectionsReport;
		projectId: ProjectId;
		selected: ConnectionNode | undefined;
		mismatch: Mismatch | undefined;
		onselect: (key: ItemKey | undefined) => void;
		onmismatch: (mismatch: Mismatch | undefined) => void;
	} = $props();

	const byKey = $derived(new Map(report.nodes.map((node) => [node.key, node])));
	const title = (key: ItemKey) => byKey.get(key)?.item.title ?? key;
	const chats = (count: number) => `${count} ${count === 1 ? 'chat' : 'chats'}`;
	const linkLabel = (kind: string) => kind.replaceAll('_', ' ');

	/** The rows under a selected item: each list is the five strongest, as the map draws them. */
	const detail = $derived.by(() => {
		if (!selected) return undefined;
		const key = selected.key;
		const pairs = report.together.filter((pair) => pair.a === key || pair.b === key);
		const other = (pair: (typeof pairs)[number]) => (pair.a === key ? pair.b : pair.a);
		const first = (pair: (typeof pairs)[number]) => (pair.a === key ? pair.aFirst : pair.bFirst);
		const after = (pair: (typeof pairs)[number]) => (pair.a === key ? pair.bFirst : pair.aFirst);
		return {
			with: pairs.map((pair) => ({ key: other(pair), count: pair.chats })),
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

	const read = $derived(report.nodes.filter((node) => node.use.kind === 'read').length);

	function suggest(a: ItemKey, b: ItemKey, trigger: HTMLElement | undefined) {
		askAgent(
			{
				prompt: `The agent keeps reading "${title(a)}" and "${title(b)}" in the same chats. Read both and suggest how they relate.`,
				projectId
			},
			trigger
		);
	}
</script>

{#snippet rows(list: readonly { key: ItemKey; count?: number; label?: string }[], heading: string)}
	{#if list.length > 0}
		<section class="flex flex-col gap-bind">
			<h3 class="text-sm font-medium">{heading}</h3>
			<ul class="flex flex-col">
				{#each list.slice(0, 5) as row (row.key)}
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

<aside class="flex min-w-0 flex-col gap-group" aria-label="Selected item">
	{#if selected || mismatch}
		<Button
			variant="ghost"
			size="sm"
			class="-ml-2 w-fit gap-1.5 text-muted-foreground"
			onclick={() => {
				onselect(undefined);
				onmismatch(undefined);
			}}
		>
			<Icon.ChevronLeft class="size-4" /> All items
		</Button>
	{/if}

	{#if selected && detail}
		<header class="flex flex-col gap-bind">
			<h2 class="section-title min-w-0"><ItemLink item={selected.item} {projectId} /></h2>
			<p class="text-sm text-muted-foreground">
				{kindNoun[selected.item.kind][0]} ·
				{selected.use.kind === 'never'
					? 'never read by the agent'
					: `read ${selected.use.times} ${selected.use.times === 1 ? 'time' : 'times'} in ${chats(selected.chats)} · last ${formatRelativeTime(selected.use.lastAt)}`}
			</p>
		</header>
		{@render rows(
			[...detail.with].sort((a, b) => b.count - a.count),
			'Read with'
		)}
		{@render rows(detail.leadsTo, 'Leads the agent to')}
		{@render rows(detail.readAfter, 'Read after')}
		{@render rows(detail.linked, 'Linked')}
		{#if detail.with.length === 0 && detail.linked.length === 0}
			<p class="text-sm text-muted-foreground">Read on its own so far.</p>
		{/if}
	{:else if mismatch === 'linked-never-together'}
		<header class="flex flex-col gap-bind">
			<h2 class="section-title flex items-baseline gap-2">
				Linked, never read together
				<span class="text-sm font-normal text-muted-foreground tabular-nums"
					>{report.mismatches.linkedNeverTogether.length}</span
				>
			</h2>
			<p class="text-sm text-muted-foreground">
				A relationship you recorded that the agent has not used in a single chat.
			</p>
		</header>
		<ul class="divide-y divide-border">
			{#each report.mismatches.linkedNeverTogether as link (`${link.from}${link.to}${link.kind}`)}
				<li class="flex flex-col gap-1 py-2 text-sm">
					<span class="min-w-0">
						<Button
							variant="link"
							size="xs"
							class="h-auto p-0 text-sm font-normal text-foreground"
							onclick={() => onselect(link.from)}>{title(link.from)}</Button
						>
						<span class="text-muted-foreground"> {linkLabel(link.kind)} </span>
						<Button
							variant="link"
							size="xs"
							class="h-auto p-0 text-sm font-normal text-foreground"
							onclick={() => onselect(link.to)}>{title(link.to)}</Button
						>
					</span>
				</li>
			{/each}
		</ul>
	{:else if mismatch === 'together-not-linked'}
		<header class="flex flex-col gap-bind">
			<h2 class="section-title flex items-baseline gap-2">
				Read together, not linked
				<span class="text-sm font-normal text-muted-foreground tabular-nums"
					>{report.mismatches.togetherNotLinked.length}</span
				>
			</h2>
			<p class="text-sm text-muted-foreground">
				Pairs the agent keeps reading in the same chat, with no relationship recorded between them.
			</p>
		</header>
		<ul class="divide-y divide-border">
			{#each report.mismatches.togetherNotLinked as pair (`${pair.a}${pair.b}`)}
				<li class="flex flex-col gap-1 py-2 text-sm">
					<Button
						variant="link"
						size="xs"
						class="h-auto justify-start truncate p-0 text-sm font-normal text-foreground"
						onclick={() => onselect(pair.a)}>{title(pair.a)}</Button
					>
					<Button
						variant="link"
						size="xs"
						class="h-auto justify-start truncate p-0 text-sm font-normal text-foreground"
						onclick={() => onselect(pair.b)}>{title(pair.b)}</Button
					>
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-muted-foreground">In {chats(pair.chats)}</span>
						<AgentAction
							action={agentActions.relate}
							moment="snap"
							class="-mr-2"
							onclick={(trigger) => suggest(pair.a, pair.b, trigger)}
						/>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<header class="flex flex-col gap-bind">
			<h2 class="section-title">Pick an item on the map</h2>
			<p class="text-sm text-muted-foreground">
				{read}
				{read === 1 ? 'item' : 'items'} read across {chats(report.chats)} · {report.together.length}
				{report.together.length === 1 ? 'pair' : 'pairs'} read together · {report.links.length}
				{report.links.length === 1 ? 'link' : 'links'} recorded {#if report.memoryLeftOut > 0}·
					memory ({report.memoryLeftOut}) left out, because it loads into every chat{/if}
			</p>
		</header>
		<section class="flex flex-col gap-bind">
			<h3 class="text-sm font-medium">Where the two disagree</h3>
			<ul class="flex flex-col">
				{#each [{ id: 'linked-never-together', label: 'Linked, never read together', count: report.mismatches.linkedNeverTogether.length }, { id: 'together-not-linked', label: 'Read together, not linked', count: report.mismatches.togetherNotLinked.length }] as const as row (row.id)}
					<li>
						<Button
							variant="ghost"
							size="xs"
							class="h-auto w-full justify-start gap-2 px-3 py-2 text-sm font-normal"
							disabled={row.count === 0}
							onclick={() => onmismatch(row.id)}
						>
							<span class="flex-1 text-left">{row.label}</span>
							<span class="text-muted-foreground tabular-nums">{row.count}</span>
							<Icon.ChevronRight class="size-4 text-muted-foreground" />
						</Button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</aside>
