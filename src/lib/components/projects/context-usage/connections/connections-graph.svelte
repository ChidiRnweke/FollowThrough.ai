<script lang="ts">
	import { Chart, Circle, Line, Polygon, Svg, Text } from 'layerchart';
	import type { ConnectionNode, ItemKey } from '$lib/models/context-usage';
	import { cn } from '$lib/utils';
	import { kindNoun } from '../kinds';
	import {
		GRAPH_HEIGHT,
		GRAPH_WIDTH,
		placeLabels,
		type GraphLayout,
		type LayoutNode
	} from './graph-layout';
	import { endsOf, type DrawnEdge } from './map-view';

	let {
		nodes,
		layoutNodes,
		edges,
		layout,
		selected,
		onselect
	}: {
		nodes: readonly ConnectionNode[];
		layoutNodes: readonly LayoutNode[];
		edges: readonly DrawnEdge[];
		layout: GraphLayout;
		selected: ItemKey | undefined;
		onselect: (key: ItemKey | undefined) => void;
	} = $props();

	let hovered = $state<ItemKey | undefined>(undefined);
	const focus = $derived(hovered ?? selected);

	/** The focused item and everything one drawn edge away keep their colour; the rest recede. */
	const neighbourhood = $derived.by(() => {
		if (!focus) return undefined;
		return new Set<string>([
			focus,
			...edges.flatMap((edge) => {
				const [a, b] = endsOf(edge);
				return a === focus ? [b] : b === focus ? [a] : [];
			})
		]);
	});

	// Placed again on focus: the focused item is always named, its neighbours where they fit.
	const drawn = $derived(new Set<string>(nodes.map((node) => node.key)));
	const labels = $derived(
		placeLabels(
			layoutNodes.filter((node) => drawn.has(node.key)),
			layout.nodes,
			neighbourhood ?? new Set(),
			new Set(focus ? [focus] : [])
		)
	);

	const fill = {
		note: 'fill-brand',
		attachment: 'fill-chart-2',
		skill: 'fill-chart-3',
		memory: 'fill-chart-5'
	} as const;
	const maxChats = $derived(
		Math.max(1, ...edges.map((edge) => (edge.kind === 'linked' ? 1 : edge.chats)))
	);
	const width = (edge: DrawnEdge) =>
		edge.kind === 'linked' ? 1 : 1 + 3 * Math.sqrt(edge.chats / maxChats);

	/** A line from rim to rim, ending short of the target when it carries an arrowhead. */
	function segment(edge: DrawnEdge) {
		const [aKey, bKey] = endsOf(edge);
		const a = layout.nodes.get(aKey);
		const b = layout.nodes.get(bKey);
		if (!a || !b) return undefined;
		const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
		const ux = (b.x - a.x) / length;
		const uy = (b.y - a.y) / length;
		const gap = edge.kind === 'order' ? b.radius + 6 : b.radius;
		return {
			x1: a.x + ux * a.radius,
			y1: a.y + uy * a.radius,
			x2: b.x - ux * gap,
			y2: b.y - uy * gap,
			muted: neighbourhood !== undefined && !(neighbourhood.has(aKey) && neighbourhood.has(bKey)),
			// A pair across two groups is real but secondary: it stays faint until one end is focused.
			bridge:
				edge.kind !== 'linked' &&
				layout.groupOf.get(aKey) !== layout.groupOf.get(bKey) &&
				aKey !== focus &&
				bKey !== focus
		};
	}

	const titleOf = $derived(new Map(nodes.map((node) => [node.key, node.item.title])));
	const edgeTip = (edge: DrawnEdge) => {
		const [a, b] = endsOf(edge).map((key) => titleOf.get(key) ?? key);
		const chats = (count: number) => `${count} ${count === 1 ? 'chat' : 'chats'}`;
		return edge.kind === 'together'
			? `${a} and ${b}: read together in ${chats(edge.chats)}`
			: edge.kind === 'order'
				? `${a}, then ${b}: in ${chats(edge.chats)}${edge.back ? ` (the other way in ${edge.back})` : ''}`
				: `${a} → ${b}: ${edge.linkKind.replaceAll('_', ' ')}`;
	};
	const nodeTip = (node: ConnectionNode) =>
		`${node.item.title} · ${kindNoun[node.item.kind][0]} · ${
			node.use.kind === 'never'
				? 'never read'
				: `read ${node.use.times} ${node.use.times === 1 ? 'time' : 'times'} in ${node.chats} ${node.chats === 1 ? 'chat' : 'chats'}`
		}`;

	// Linked edges first, so the read edges sit on top of them.
	const ordered = $derived(
		[...edges].sort((a, b) => Number(a.kind !== 'linked') - Number(b.kind !== 'linked'))
	);
</script>

<!-- Below the width where labels stay legible the map keeps that width and scrolls sideways. -->
<div class="w-full overflow-x-auto rounded-lg border border-border">
	<div class="aspect-[18/13] max-h-128 w-full min-w-128">
		<Chart>
			<Svg viewBox="0 0 {GRAPH_WIDTH} {GRAPH_HEIGHT}">
				<!-- Clicking empty space lets go of the pinned item. -->
				<rect
					width={GRAPH_WIDTH}
					height={GRAPH_HEIGHT}
					class="fill-transparent"
					role="presentation"
					onclick={() => onselect(undefined)}
				/>
				{#each ordered as edge, index (index)}
					{@const line = segment(edge)}
					{#if line}
						<g
							class={[
								'transition-opacity',
								line.muted ? 'opacity-10' : line.bridge && 'opacity-25'
							]}
						>
							<title>{edgeTip(edge)}</title>
							<Line
								x1={line.x1}
								y1={line.y1}
								x2={line.x2}
								y2={line.y2}
								strokeWidth={line.bridge ? 1 : width(edge)}
								class={edge.kind === 'linked' ? 'stroke-muted-foreground' : 'stroke-brand'}
								stroke-linecap="round"
								markerEnd={edge.kind === 'order' ? 'arrow' : undefined}
							/>
						</g>
					{/if}
				{/each}
				{#each nodes as node (node.key)}
					{@const at = layout.nodes.get(node.key)}
					{#if at}
						{@const muted = neighbourhood !== undefined && !neighbourhood.has(node.key)}
						{@const mark = cn(
							'mark transition-colors',
							node.use.kind === 'never'
								? 'fill-background stroke-muted-foreground'
								: muted
									? 'fill-chart-1 stroke-background'
									: [fill[node.item.kind], 'stroke-background'],
							selected === node.key && 'stroke-foreground'
						)}
						<g
							role="button"
							tabindex="0"
							aria-label={nodeTip(node)}
							aria-pressed={selected === node.key}
							class="cursor-pointer outline-none [&:focus-visible>.mark]:stroke-foreground"
							onpointerenter={() => (hovered = node.key)}
							onpointerleave={() => (hovered = undefined)}
							onfocus={() => (hovered = node.key)}
							onblur={() => (hovered = undefined)}
							onclick={() => onselect(selected === node.key ? undefined : node.key)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									onselect(selected === node.key ? undefined : node.key);
								}
								if (event.key === 'Escape') onselect(undefined);
							}}
						>
							<title>{nodeTip(node)}</title>
							<!-- A hit area of at least 24px, whatever the circle's size. -->
							<Circle cx={at.x} cy={at.y} r={Math.max(at.radius, 12)} class="fill-transparent" />
							<!-- Kind is a shape as well as a shade: a note is a circle, a file a square, a skill a diamond. -->
							{#if node.item.kind === 'attachment'}
								<Polygon
									cx={at.x}
									cy={at.y}
									r={at.radius * 1.2}
									points={4}
									rotate={45}
									cornerRadius={2}
									strokeWidth={2}
									class={mark}
								/>
							{:else if node.item.kind === 'skill'}
								<Polygon
									cx={at.x}
									cy={at.y}
									r={at.radius * 1.3}
									points={4}
									cornerRadius={2}
									strokeWidth={2}
									class={mark}
								/>
							{:else}
								<Circle cx={at.x} cy={at.y} r={at.radius} strokeWidth={2} class={mark} />
							{/if}
						</g>
					{/if}
				{/each}
				{#each labels as label (label.key)}
					{@const muted = neighbourhood !== undefined && !neighbourhood.has(label.key)}
					<Text
						x={label.x}
						y={label.y}
						value={label.text}
						textAnchor="middle"
						class={cn(
							'pointer-events-none text-xs [paint-order:stroke] stroke-background stroke-[3px]',
							neighbourhood?.has(label.key)
								? 'fill-foreground font-medium'
								: 'fill-muted-foreground',
							muted && 'opacity-40'
						)}
					/>
				{/each}
			</Svg>
		</Chart>
	</div>
</div>
