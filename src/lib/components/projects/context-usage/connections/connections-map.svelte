<script lang="ts">
	import type {
		ConnectionNode,
		ConnectionThreshold,
		ItemKey,
		ProjectConnectionsReport
	} from '$lib/models/context-usage';
	import type { ProjectId } from '$lib/models/projects';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import ConnectionsGraph from './connections-graph.svelte';
	import ConnectionsPanel, { type Mismatch } from './connections-panel.svelte';
	import ConnectionsTable from './connections-table.svelte';
	import { layoutGraph, type LayoutNode } from './graph-layout';
	import { MAP_CEILING, STRONGEST_PER_ITEM, mapView, type EdgeMode } from './map-view';

	let { report, projectId }: { report: ProjectConnectionsReport; projectId: ProjectId } = $props();

	const thresholds: readonly ConnectionThreshold[] = [1, 2, 3, 5, 8];

	// The starting threshold is the report's: the lowest at which the map stays readable.
	// svelte-ignore state_referenced_locally
	let min = $state<number>(report.defaultThreshold);
	let mode = $state<EdgeMode>('together');
	let showLinked = $state(true);
	let selected = $state<ItemKey | undefined>(undefined);
	let mismatch = $state<Mismatch | undefined>(undefined);
	let ego = $state(false);
	let allPairs = $state(false);

	const byKey = $derived(new Map(report.nodes.map((node) => [node.key, node])));
	/** The pairs of the list open in the panel, kept in colour on the map. */
	const emphasis = $derived.by(() => {
		if (mismatch === 'linked-never-together')
			return new Set<string>(
				report.mismatches.linkedNeverTogether.flatMap((link) => [link.from, link.to])
			);
		if (mismatch === 'together-not-linked')
			return new Set<string>(
				report.mismatches.togetherNotLinked.flatMap((pair) => [pair.a, pair.b])
			);
		return undefined;
	});
	const ambient = $derived(report.ambient.flatMap((key) => byKey.get(key) ?? []));

	// The layout ignores the selection and the edge mode, so neither moves the picture.
	const egoKey = $derived(ego ? selected : undefined);
	// Laid out once from every pair and link that could be drawn, so switching between Together,
	// In order and Linked changes the lines, never where the items sit.
	// "Show every pair" draws more lines on the same picture: the layout keeps the strongest pairs.
	const resting = $derived(
		mapView(report, { mode: 'together', min, showLinked: true, ego: egoKey, allPairs: false })
	);
	const view = $derived(
		mapView(report, { mode, min, showLinked, ego: egoKey, selected, allPairs })
	);

	const maxTimes = $derived(
		Math.max(1, ...report.nodes.map((node) => (node.use.kind === 'read' ? node.use.times : 0)))
	);
	const radiusOf = (node: ConnectionNode) =>
		node.use.kind === 'never' ? 7 : 6 + 16 * Math.sqrt(node.use.times / maxTimes);
	const layoutNodes = $derived<LayoutNode[]>(
		resting.placed.map((node, rank) => ({
			key: node.key,
			radius: radiusOf(node),
			label: node.item.title,
			rank
		}))
	);
	const layout = $derived(layoutGraph(layoutNodes, resting.layoutEdges));

	// A picture of more circles than this is a texture, so the table opens first.
	// svelte-ignore state_referenced_locally
	let show = $state<'map' | 'table'>(
		mapView(report, {
			mode: 'together',
			min: report.defaultThreshold,
			showLinked: true,
			allPairs: false
		}).placed.length > MAP_CEILING
			? 'table'
			: 'map'
	);

	const selectedNode = $derived(selected ? byKey.get(selected) : undefined);
	const select = (key: ItemKey | undefined) => {
		selected = key;
		if (key) mismatch = undefined;
		if (!key) ego = false;
	};
	const chats = (count: number) => `${count} ${count === 1 ? 'chat' : 'chats'}`;
</script>

<!--
	Side by side only when the content area has room for both, measured on the area itself: the
	docked chat narrows it at any window size, and the map needs its width more than the panel.
-->
<div class="@container">
	<div class="grid items-start gap-section @4xl:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="flex min-w-0 flex-col gap-row">
			<!-- Two fixed rows, so switching views never moves the map: what to draw and how, then how much. -->
			<div class="flex flex-wrap items-center justify-between gap-2">
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					value={mode}
					onValueChange={(value) =>
						(mode = value === 'order' ? 'order' : value === 'linked' ? 'linked' : 'together')}
					aria-label="Edges"
				>
					<ToggleGroup.Item value="together">Together</ToggleGroup.Item>
					<ToggleGroup.Item value="order">In order</ToggleGroup.Item>
					<ToggleGroup.Item value="linked">Linked</ToggleGroup.Item>
				</ToggleGroup.Root>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					value={show}
					onValueChange={(value) => (show = value === 'table' ? 'table' : 'map')}
					aria-label="View"
				>
					<ToggleGroup.Item value="map">Map</ToggleGroup.Item>
					<ToggleGroup.Item value="table">Table</ToggleGroup.Item>
				</ToggleGroup.Root>
			</div>
			<div
				class={['flex flex-wrap items-center gap-x-4 gap-y-2', mode === 'linked' && 'invisible']}
			>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					value={String(min)}
					onValueChange={(value) => (min = Number(value) || min)}
					aria-label="Fewest shared chats"
				>
					{#each thresholds as threshold (threshold)}
						<ToggleGroup.Item value={String(threshold)} aria-label="At least {chats(threshold)}"
							>≥ {threshold}</ToggleGroup.Item
						>
					{/each}
				</ToggleGroup.Root>
				<div class="flex items-center gap-2">
					<Checkbox id="show-linked" bind:checked={showLinked} />
					<Label for="show-linked" class="text-sm font-normal text-muted-foreground"
						>Show linked</Label
					>
				</div>
			</div>

			<!-- Room for two caption lines whether or not they show, so the map stays where it is. -->
			<p class="min-h-8 text-xs text-muted-foreground">
				{#if mode !== 'linked' && (view.belowThreshold > 0 || view.beyondStrongest > 0 || allPairs)}
					{#if show === 'map' && view.beyondStrongest > 0}
						Each item shows its {STRONGEST_PER_ITEM} strongest pairs · {view.beyondStrongest} more
						{view.beyondStrongest === 1 ? 'pair' : 'pairs'} hidden.
						<Button
							variant="link"
							size="xs"
							class="h-auto p-0 text-xs text-brand"
							onclick={() => (allPairs = true)}>Show every pair</Button
						>
					{:else if show === 'map' && allPairs}
						Showing every pair.
						<Button
							variant="link"
							size="xs"
							class="h-auto p-0 text-xs text-brand"
							onclick={() => (allPairs = false)}>Only the strongest</Button
						>
					{/if}
					{#if view.belowThreshold > 0}
						<br />Pairs read together in fewer than {chats(min)} are hidden ({view.belowThreshold}).
					{/if}
				{/if}
			</p>

			{#if show === 'table'}
				{#if resting.placed.length > MAP_CEILING}
					<p class="text-sm text-muted-foreground">
						Too many items to draw clearly. Raise the threshold or pick an item to see it on the
						map.
					</p>
				{/if}
				<ConnectionsTable {report} {min} onselect={(key) => select(key)} />
			{:else}
				{#if selectedNode && view.placed.length > 40}
					<Button variant="outline" size="sm" class="w-fit" onclick={() => (ego = !ego)}>
						{ego ? 'Show every item' : `Only ${selectedNode.item.title} and what it is read with`}
					</Button>
				{/if}
				<ConnectionsGraph
					nodes={view.placed}
					{layoutNodes}
					edges={view.edges}
					{layout}
					{selected}
					{emphasis}
					onselect={select}
				/>
			{/if}

			<div class="flex flex-col gap-1.5 text-xs text-muted-foreground">
				<ul class="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
					<li class="flex items-center gap-1.5">
						<span class="size-2.5 rounded-full bg-brand"></span>Note
					</li>
					<li class="flex items-center gap-1.5">
						<span class="size-2.5 rounded-xs bg-chart-2"></span>File
					</li>
					<li class="flex items-center gap-1.5">
						<span class="size-2.5 rotate-45 rounded-xs bg-chart-3"></span>Skill
					</li>
					<li class="flex items-center gap-1.5">
						<span class="size-2.5 rounded-full border-[1.5px] border-muted-foreground"></span>Never
						read
					</li>
					{#if mode !== 'linked'}
						<li class="flex items-center gap-1.5">
							<span class="h-0.5 w-4 bg-brand"></span>{mode === 'order'
								? 'Read first → read next'
								: 'Read together'}
						</li>
					{/if}
					{#if mode === 'linked' || showLinked}
						<li class="flex items-center gap-1.5">
							<span class="h-px w-4 bg-muted-foreground"></span>Linked
						</li>
					{/if}
					<li>Size: times read{mode === 'linked' ? '' : ' · line: shared chats'}</li>
				</ul>
				{#each ambient as node (node.key)}
					<p>
						<Button
							variant="link"
							size="xs"
							class="h-auto p-0 text-xs font-medium text-foreground"
							onclick={() => select(node.key)}>{node.item.title}</Button
						>
						is read in {node.chats} of {report.chats} chats, so its pairs show only when it is selected.
					</p>
				{/each}
				{#if show === 'map' && mode !== 'linked' && view.alone.length > 0}
					<p>
						Read alone at this threshold · {view.alone.length}:
						{#each view.alone as node, index (node.key)}<Button
								variant="link"
								size="xs"
								class="h-auto p-0 text-xs font-normal text-foreground"
								onclick={() => select(node.key)}>{node.item.title}</Button
							>{index < view.alone.length - 1 ? ', ' : ''}{/each}
					</p>
				{/if}
			</div>
		</div>

		<ConnectionsPanel
			{report}
			{projectId}
			selected={selectedNode}
			{mismatch}
			onselect={select}
			onmismatch={(next) => {
				mismatch = next;
				if (next) selected = undefined;
			}}
		/>
	</div>
</div>
