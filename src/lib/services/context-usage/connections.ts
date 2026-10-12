import type {
	AuthoredLink,
	ConnectionMismatches,
	ConnectionTables,
	ConnectionThreshold,
	ItemKey,
	ProjectConnections,
	ReadTogether
} from '$lib/models/context-usage';

/**
 * An item read in this share of a project's chats or more is background: it goes with
 * everything, so its edges say nothing about what goes with what.
 */
const AMBIENT_SHARE = 0.6;

/** Under this many chats a share is a handful of coincidences, not a pattern. */
const AMBIENT_MIN_CHATS = 5;

/**
 * The minimum edge weights the map offers. On the measured 26-item, 18-chat project, a
 * minimum of 1 drew about 150 edges, which no one can read; the default is the smallest
 * step that keeps the edges within a few per item.
 */
const THRESHOLDS: readonly ConnectionThreshold[] = [1, 2, 3, 5, 8];

/** Edges per drawn item that the default threshold allows. */
const EDGES_PER_ITEM = 3;

/** Both orders of one pair name the same pair. */
const pairKey = (x: ItemKey, y: ItemKey) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** One RFC 4180 field: quoted when it holds a separator, a quote or a line break. */
const field = (value: string | number) => {
	const text = String(value);
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const table = (rows: readonly (readonly (string | number)[])[]) =>
	rows.map((row) => row.map(field).join(',')).join('\r\n') + '\r\n';

const ambientOf = (connections: ProjectConnections): ReadonlySet<ItemKey> =>
	connections.chats < AMBIENT_MIN_CHATS
		? new Set()
		: new Set(
				connections.nodes
					.filter((node) => node.chats / connections.chats >= AMBIENT_SHARE)
					.map((node) => node.key)
			);

const edgesAtThreshold = (
	connections: ProjectConnections,
	min: number,
	ambient: ReadonlySet<ItemKey>
): readonly ReadTogether[] =>
	connections.together.filter(
		(edge) => edge.chats >= min && !ambient.has(edge.a) && !ambient.has(edge.b)
	);

/** Rules that read a project's connections the same way wherever they are drawn. */
export interface ConnectionAnalysis {
	/** Where what the user linked and what the agent reads together disagree. */
	mismatches(connections: ProjectConnections): ConnectionMismatches;
	/** Items read in most chats; their edges are hidden by default. */
	ambient(connections: ProjectConnections): readonly ItemKey[];
	/** The smallest offered minimum that keeps the non-ambient map readable. */
	defaultThreshold(connections: ProjectConnections): ConnectionThreshold;
	/** The nodes and edges as CSV, one edge row per pair read together or linked. */
	tables(connections: ProjectConnections): ConnectionTables;
}

export class ConnectionAnalysisService implements ConnectionAnalysis {
	mismatches(connections: ProjectConnections): ConnectionMismatches {
		const together = new Set(connections.together.map((edge) => pairKey(edge.a, edge.b)));
		const linked = new Set(connections.links.map((link) => pairKey(link.from, link.to)));
		// An item read in most chats meets everything; its pairs are not relationships worth recording.
		const ambient = ambientOf(connections);
		return {
			linkedNeverTogether: connections.links.filter(
				(link) => !together.has(pairKey(link.from, link.to))
			),
			togetherNotLinked: connections.together
				.filter(
					(edge) =>
						edge.chats >= 2 &&
						!linked.has(pairKey(edge.a, edge.b)) &&
						!ambient.has(edge.a) &&
						!ambient.has(edge.b)
				)
				.sort((x, y) => y.chats - x.chats)
		};
	}

	ambient(connections: ProjectConnections): readonly ItemKey[] {
		return [...ambientOf(connections)];
	}

	defaultThreshold(connections: ProjectConnections): ConnectionThreshold {
		const ambient = ambientOf(connections);
		return (
			THRESHOLDS.find((min) => {
				const edges = edgesAtThreshold(connections, min, ambient);
				const drawn = new Set(edges.flatMap((edge) => [edge.a, edge.b]));
				return edges.length <= EDGES_PER_ITEM * drawn.size;
			}) ?? THRESHOLDS[THRESHOLDS.length - 1]
		);
	}

	tables(connections: ProjectConnections): ConnectionTables {
		const titled = new Map<string, number>();
		for (const node of connections.nodes)
			titled.set(node.item.title, (titled.get(node.item.title) ?? 0) + 1);
		// A title names an item for a reader; two items with one title need their keys.
		const names = new Map(
			connections.nodes.map((node) => [
				node.key,
				titled.get(node.item.title) === 1 ? node.item.title : node.key
			])
		);
		// Every edge endpoint is a node, so the key is only ever a fallback for a broken map.
		const name = (key: ItemKey) => names.get(key) ?? key;

		const nodes = table([
			['key', 'kind', 'title', 'times_read', 'last_read', 'chats'],
			...connections.nodes.map((node) => [
				node.key,
				node.item.kind,
				node.item.title,
				node.use.kind === 'read' ? node.use.times : 0,
				node.use.kind === 'read' ? node.use.lastAt : '',
				node.chats
			])
		]);

		// A pair linked but never read together was read together in no chats: zero is its count.
		const pairs = new Map<string, ReadTogether & { kinds: readonly AuthoredLink['kind'][] }>();
		for (const edge of connections.together)
			pairs.set(pairKey(edge.a, edge.b), { ...edge, kinds: [] });
		for (const link of connections.links) {
			const key = pairKey(link.from, link.to);
			const [a, b] = link.from < link.to ? [link.from, link.to] : [link.to, link.from];
			const pair = pairs.get(key) ?? { a, b, chats: 0, aFirst: 0, bFirst: 0, kinds: [] };
			pairs.set(key, { ...pair, kinds: [...pair.kinds, link.kind] });
		}
		const edges = table([
			[
				'item_a',
				'item_b',
				'chats_read_together',
				'a_before_b_chats',
				'b_before_a_chats',
				'linked_kinds'
			],
			...[...pairs.values()].map((pair) => [
				name(pair.a),
				name(pair.b),
				pair.chats,
				pair.aFirst,
				pair.bFirst,
				pair.kinds.join(';')
			])
		]);
		return { nodes, edges };
	}
}
