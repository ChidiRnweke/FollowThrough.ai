<script lang="ts">
	import type { ItemKey, ProjectConnectionsReport } from '$lib/models/context-usage';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import * as Icon from '$lib/components/icons';

	let {
		report,
		min,
		onselect
	}: {
		report: ProjectConnectionsReport;
		min: number;
		onselect: (key: ItemKey) => void;
	} = $props();

	type Sort = 'together' | 'order';
	let sort = $state<Sort>('together');

	const title = $derived(
		(key: ItemKey) => report.nodes.find((node) => node.key === key)?.item.title ?? key
	);
	const linkKinds = (a: ItemKey, b: ItemKey) =>
		report.links
			.filter((link) => (link.from === a && link.to === b) || (link.from === b && link.to === a))
			.map((link) => link.kind.replaceAll('_', ' '))
			.join(', ');

	/**
	 * The map's values without the drawing: one row per pair read together at this threshold, then
	 * the links never read together, so nothing on the map exists only as a line.
	 */
	const rows = $derived.by(() => {
		const together = report.together
			.filter((pair) => pair.chats >= min)
			.map((pair) => ({
				a: pair.a,
				b: pair.b,
				together: pair.chats,
				aFirst: pair.aFirst,
				bFirst: pair.bFirst,
				linked: linkKinds(pair.a, pair.b)
			}));
		const unread = report.mismatches.linkedNeverTogether.map((link) => ({
			a: link.from,
			b: link.to,
			together: 0,
			aFirst: 0,
			bFirst: 0,
			linked: link.kind.replaceAll('_', ' ')
		}));
		const all = [...together, ...unread];
		return sort === 'together'
			? all
			: [...all].sort((x, y) => Math.max(y.aFirst, y.bFirst) - Math.max(x.aFirst, x.bFirst));
	});
</script>

<div class="max-h-128 overflow-auto rounded-lg border border-border">
	<Table.Root class="table-fixed">
		<Table.Header class="sticky top-0 bg-background">
			<Table.Row>
				<Table.Head class="w-1/4">Item</Table.Head>
				<Table.Head class="w-1/4">With</Table.Head>
				<Table.Head
					class="w-1/8 text-right"
					aria-sort={sort === 'together' ? 'descending' : 'none'}
				>
					<Button
						variant="ghost"
						size="xs"
						class="-mx-2 gap-1 text-sm font-medium"
						onclick={() => (sort = 'together')}
					>
						Together {#if sort === 'together'}<Icon.ArrowDown class="size-3" />{/if}
					</Button>
				</Table.Head>
				<Table.Head class="w-1/8 text-right" aria-sort={sort === 'order' ? 'descending' : 'none'}>
					<Button
						variant="ghost"
						size="xs"
						class="-mx-2 gap-1 text-sm font-medium"
						onclick={() => (sort = 'order')}
					>
						Item first {#if sort === 'order'}<Icon.ArrowDown class="size-3" />{/if}
					</Button>
				</Table.Head>
				<Table.Head class="w-1/8 text-right">With first</Table.Head>
				<Table.Head>Linked</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row (`${row.a}|${row.b}|${row.linked}`)}
				<Table.Row>
					<Table.Cell class="truncate">
						<Button
							variant="link"
							size="xs"
							class="h-auto max-w-full justify-start truncate p-0 text-sm font-normal text-foreground"
							onclick={() => onselect(row.a)}>{title(row.a)}</Button
						>
					</Table.Cell>
					<Table.Cell class="truncate">
						<Button
							variant="link"
							size="xs"
							class="h-auto max-w-full justify-start truncate p-0 text-sm font-normal text-foreground"
							onclick={() => onselect(row.b)}>{title(row.b)}</Button
						>
					</Table.Cell>
					<Table.Cell class="text-right tabular-nums">{row.together || '—'}</Table.Cell>
					<Table.Cell class="text-right text-muted-foreground tabular-nums"
						>{row.aFirst || '—'}</Table.Cell
					>
					<Table.Cell class="text-right text-muted-foreground tabular-nums"
						>{row.bFirst || '—'}</Table.Cell
					>
					<Table.Cell class="truncate text-muted-foreground">{row.linked || '—'}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
