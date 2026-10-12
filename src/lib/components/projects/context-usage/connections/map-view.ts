import type {
	AuthoredLinkKind,
	ConnectionNode,
	ItemKey,
	ProjectConnectionsReport,
	ReadTogether
} from '$lib/models/context-usage';

export type EdgeMode = 'together' | 'order' | 'linked';

export interface MapOptions {
	readonly mode: EdgeMode;
	/** The fewest shared chats a pair needs to be drawn. */
	readonly min: number;
	/** Draw what the user linked under the read edges, in the together and in-order modes. */
	readonly showLinked: boolean;
	/** The pinned item: an ambient item's own pairs are drawn only while it is selected. */
	readonly selected?: ItemKey;
	/** Draw only this item and what it is read with, laid out on their own. */
	readonly ego?: ItemKey;
}

export type DrawnEdge =
	| { readonly kind: 'together'; readonly a: ItemKey; readonly b: ItemKey; readonly chats: number }
	| {
			readonly kind: 'order';
			readonly from: ItemKey;
			readonly to: ItemKey;
			/** Chats where `from` came first. */
			readonly chats: number;
			/** Chats where the order was the other way. */
			readonly back: number;
	  }
	| {
			readonly kind: 'linked';
			readonly from: ItemKey;
			readonly to: ItemKey;
			readonly linkKind: AuthoredLinkKind;
	  };

export interface MapView {
	/** What the force layout places. */
	readonly placed: readonly ConnectionNode[];
	/** The edges the layout pulls on: the drawn read and link edges, minus an ambient item's. */
	readonly layoutEdges: readonly {
		readonly a: ItemKey;
		readonly b: ItemKey;
		readonly weight: number;
	}[];
	readonly edges: readonly DrawnEdge[];
}

/** How many partners each item keeps on a dense map. */
export const STRONGEST_PER_ITEM = 3;

/**
 * How much two items belong together, not how often they happen to meet: shared chats over the
 * chats either was read in. Two items read in every chat share many chats and say little.
 */
export const affinity = (pair: ReadTogether, chatsOf: (key: ItemKey) => number): number =>
	pair.chats / Math.max(1, chatsOf(pair.a) + chatsOf(pair.b) - pair.chats);

/**
 * The backbone of a dense map: each item keeps its few strongest pairs, and a pair stays when
 * either of its items keeps it. The lines then number at most a few per item, and a cluster
 * keeps its shape because its members' strongest pairs lie inside it.
 */
function strongest(
	pairs: readonly ReadTogether[],
	chatsOf: (key: ItemKey) => number
): ReadTogether[] {
	const byItem = new Map<ItemKey, ReadTogether[]>();
	for (const pair of pairs)
		for (const key of [pair.a, pair.b]) byItem.set(key, [...(byItem.get(key) ?? []), pair]);
	const kept = new Set<ReadTogether>();
	for (const list of byItem.values())
		for (const pair of [...list]
			.sort((x, y) => affinity(y, chatsOf) - affinity(x, chatsOf) || y.chats - x.chats)
			.slice(0, STRONGEST_PER_ITEM))
			kept.add(pair);
	return pairs.filter((pair) => kept.has(pair));
}

export const endsOf = (edge: DrawnEdge): readonly [ItemKey, ItemKey] =>
	edge.kind === 'together' ? [edge.a, edge.b] : [edge.from, edge.to];

/** The direction a pair was read in more often; a pair read in either order equally has none. */
export function orderOf(pair: ReadTogether): DrawnEdge | undefined {
	if (pair.aFirst === pair.bFirst) return undefined;
	return pair.aFirst > pair.bFirst
		? { kind: 'order', from: pair.a, to: pair.b, chats: pair.aFirst, back: pair.bFirst }
		: { kind: 'order', from: pair.b, to: pair.a, chats: pair.bFirst, back: pair.aFirst };
}

/**
 * What the map draws for one set of choices. The layout only sees edges that hold the picture
 * together: an ambient item (read in most chats) would pull every node to itself, so its pairs
 * are drawn only while it is selected, and never move the layout.
 */
export function mapView(report: ProjectConnectionsReport, options: MapOptions): MapView {
	const ambient = new Set(report.ambient);
	const byKey = new Map(report.nodes.map((node) => [node.key, node]));
	const touchesAmbient = (pair: ReadTogether) => ambient.has(pair.a) || ambient.has(pair.b);
	const involves = (pair: ReadTogether, key: ItemKey) => pair.a === key || pair.b === key;

	const chatsOf = (key: ItemKey) => byKey.get(key)?.chats ?? 0;
	const strong = report.together.filter((pair) => pair.chats >= options.min);
	const ego = options.ego;
	const selected = options.selected;
	const base = strong.filter((pair) => !touchesAmbient(pair));
	const baseItems = new Set(base.flatMap((pair) => [pair.a, pair.b]));
	// Dense: more than two lines per item on average, the point at which lines cross into a mesh.
	const dense = base.length > 2 * baseItems.size;
	const backbone = dense ? strongest(base, chatsOf) : base;
	const shown = ego
		? strong.filter((pair) => involves(pair, ego))
		: [
				...backbone,
				...(selected
					? strong.filter(
							(pair) =>
								involves(pair, selected) && (touchesAmbient(pair) || !backbone.includes(pair))
						)
					: [])
			];

	const readEdges: DrawnEdge[] =
		options.mode === 'linked'
			? []
			: options.mode === 'together'
				? shown.map((pair) => ({ kind: 'together', a: pair.a, b: pair.b, chats: pair.chats }))
				: shown.flatMap((pair) => orderOf(pair) ?? []);

	const linksShown = options.mode === 'linked' || options.showLinked;
	const linkEdges: DrawnEdge[] = linksShown
		? report.links
				.filter((link) => !options.ego || link.from === options.ego || link.to === options.ego)
				.map((link) => ({ kind: 'linked', from: link.from, to: link.to, linkKind: link.kind }))
		: [];
	const edges = [...linkEdges, ...readEdges];

	const drawnKeys = new Set(edges.flatMap(endsOf));
	if (options.ego) drawnKeys.add(options.ego);
	const placed = report.nodes.filter(
		(node) => drawnKeys.has(node.key) || (!options.ego && ambient.has(node.key))
	);

	const layoutEdges = edges
		.filter((edge) => {
			const [a, b] = endsOf(edge);
			return options.ego !== undefined || !(ambient.has(a) || ambient.has(b));
		})
		.map((edge) => {
			const [a, b] = endsOf(edge);
			const pair = report.together.find(
				(candidate) =>
					(candidate.a === a && candidate.b === b) || (candidate.a === b && candidate.b === a)
			);
			// The layout pulls by affinity, so a pair that meets only because both are common sits apart.
			return { a, b, weight: edge.kind === 'linked' || !pair ? 0.2 : affinity(pair, chatsOf) };
		})
		.filter((edge) => byKey.has(edge.a) && byKey.has(edge.b));

	return {
		placed,
		layoutEdges,
		edges
	};
}

/** Above this many drawn items the map opens on its table: a picture of 150 circles is a texture. */
export const MAP_CEILING = 150;
