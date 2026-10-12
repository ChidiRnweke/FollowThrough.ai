import {
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	forceX,
	forceY,
	type SimulationLinkDatum,
	type SimulationNodeDatum
} from 'd3-force';

/** The drawing space every layout is fitted into; the chart scales it to its container. */
export const GRAPH_WIDTH = 720;
export const GRAPH_HEIGHT = 520;
const MARGIN = 28;
/** Kept clear at the top for the legend the map draws over its corners. */
const LEGEND_BAND = 26;

export interface LayoutNode {
	readonly key: string;
	readonly radius: number;
	readonly label: string;
	/** Labels are placed in this order, so the most-read items keep theirs when space runs out. */
	readonly rank: number;
}

export interface LayoutEdge {
	readonly a: string;
	readonly b: string;
	readonly weight: number;
}

export interface PlacedNode {
	readonly key: string;
	readonly x: number;
	readonly y: number;
	readonly radius: number;
}

export interface PlacedLabel {
	readonly key: string;
	readonly x: number;
	readonly y: number;
	readonly text: string;
}

export interface GraphLayout {
	readonly nodes: ReadonlyMap<string, PlacedNode>;
	/** One label per node that had room for one, drawn under its circle. */
	readonly labels: readonly PlacedLabel[];
	/** Which group each item fell in; an edge between two groups is a bridge, drawn quietly. */
	readonly groupOf: ReadonlyMap<string, number>;
}

type SimNode = SimulationNodeDatum & { key: string; radius: number };
type SimLink = SimulationLinkDatum<SimNode> & { weight: number; across: boolean };

/** A fixed hash, so the same graph always starts, and therefore settles, in the same place. */
const hash = (text: string): number => {
	let value = 2166136261;
	for (let index = 0; index < text.length; index++)
		value = Math.imul(value ^ text.charCodeAt(index), 16777619);
	return (value >>> 0) / 4294967296;
};

/**
 * Groups of items read together, largest first: each gets its own area, so clusters stay apart
 * even when a few cross-cluster reads connect them. Weighted label propagation: every item takes
 * the group its neighbours weigh most toward, in a fixed order, until nothing changes. Items with
 * no edge between them can never share a group, so disconnected parts are always apart too.
 */
export function communities(
	nodes: readonly LayoutNode[],
	edges: readonly LayoutEdge[]
): string[][] {
	const neighbours = new Map<string, { key: string; weight: number }[]>(
		nodes.map((node) => [node.key, []])
	);
	for (const edge of edges) {
		neighbours.get(edge.a)?.push({ key: edge.b, weight: edge.weight });
		neighbours.get(edge.b)?.push({ key: edge.a, weight: edge.weight });
	}
	const group = new Map(nodes.map((node) => [node.key, node.key]));
	const order = [...nodes].map((node) => node.key).sort();
	for (let round = 0; round < 30; round++) {
		let changed = false;
		for (const key of order) {
			const pull = new Map<string, number>();
			for (const near of neighbours.get(key) ?? []) {
				const label = group.get(near.key) ?? near.key;
				pull.set(label, (pull.get(label) ?? 0) + near.weight);
			}
			if (pull.size === 0) continue;
			const [best] = [...pull.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
			if (best !== group.get(key)) {
				group.set(key, best);
				changed = true;
			}
		}
		if (!changed) break;
	}
	const groups = new Map<string, string[]>();
	for (const key of order) {
		const label = group.get(key) ?? key;
		groups.set(label, [...(groups.get(label) ?? []), key]);
	}
	return [...groups.values()].sort((a, b) => b.length - a.length);
}

/**
 * Where each group starts: the largest in the middle, the rest around it, larger ones closer.
 * Only a start: the groups then settle against each other, so none is given space it cannot use.
 */
function seeds(groups: readonly string[][]): Map<string, { x: number; y: number }> {
	const placed = new Map<string, { x: number; y: number }>();
	groups.forEach((group, index) => {
		const angle = index * 2.39996; // the golden angle, so neighbours in size never stack
		const distance = index === 0 ? 0 : 60 + 26 * Math.sqrt(index);
		const at = {
			x: GRAPH_WIDTH / 2 + Math.cos(angle) * distance,
			y: GRAPH_HEIGHT / 2 + Math.sin(angle) * distance
		};
		for (const key of group) placed.set(key, at);
	});
	return placed;
}

/** Label width at 12px Inter: about 7px a character, rounded up. Only used to avoid collisions. */
const labelWidth = (text: string) => text.length * 7;
const LABEL_HEIGHT = 13;
const LABEL_LIMIT = 24;
/**
 * Long titles keep their start and their end: titles in one project often share a prefix
 * ("Market price log — week 12", "… week 13"), and cutting the end makes them identical.
 */
const shorten = (text: string) =>
	text.length > LABEL_LIMIT ? `${text.slice(0, 13)}…${text.slice(-(LABEL_LIMIT - 14))}` : text;

interface Box {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}
const overlaps = (a: Box, b: Box) =>
	a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Greedy label placement. The pinned item (the one in focus) is labelled first and always; then
 * the priority items (its neighbourhood), then the rest by rank. Each label tries below, above,
 * right and left of its circle, and is skipped when every spot would cover another label or a
 * circle: a dense neighbourhood shows the names that fit, never a pile of them.
 */
export function placeLabels(
	nodes: readonly LayoutNode[],
	placed: ReadonlyMap<string, PlacedNode>,
	priority: ReadonlySet<string> = new Set(),
	pinned: ReadonlySet<string> = new Set()
): PlacedLabel[] {
	const circles: Box[] = [...placed.values()].map((node) => ({
		left: node.x - node.radius,
		top: node.y - node.radius,
		right: node.x + node.radius,
		bottom: node.y + node.radius
	}));
	const taken: Box[] = [];
	const labels: PlacedLabel[] = [];
	const weight = (key: string) => (pinned.has(key) ? 2 : priority.has(key) ? 1 : 0);
	const ordered = [...nodes].sort((a, b) => weight(b.key) - weight(a.key) || a.rank - b.rank);
	for (const node of ordered) {
		const at = placed.get(node.key);
		if (!at) continue;
		const text = shorten(node.label);
		const width = labelWidth(text);
		const gap = at.radius + 4;
		// Baselines: below, above, right, left of the circle.
		const spots = [
			{ x: at.x, y: at.y + gap + 9 },
			{ x: at.x, y: at.y - gap - 3 },
			{ x: at.x + gap + width / 2, y: at.y + 4 },
			{ x: at.x - gap - width / 2, y: at.y + 4 }
		].map((spot) => {
			// Kept inside the drawing space: a label at the edge shifts inward rather than clip.
			const x = Math.min(Math.max(spot.x, width / 2 + 2), GRAPH_WIDTH - width / 2 - 2);
			const y = Math.min(Math.max(spot.y, LABEL_HEIGHT), GRAPH_HEIGHT - 3);
			return {
				x,
				y,
				box: { left: x - width / 2, top: y - 10, right: x + width / 2, bottom: y + 3 }
			};
		});
		const free = spots.find(
			(spot) =>
				!taken.some((other) => overlaps(spot.box, other)) &&
				!circles.some((circle) => overlaps(spot.box, circle))
		);
		const chosen = free ?? (pinned.has(node.key) ? spots[0] : undefined);
		if (!chosen) continue;
		taken.push(chosen.box);
		labels.push({ key: node.key, x: chosen.x, y: chosen.y, text });
	}
	return labels;
}

/**
 * A force layout run to rest before it is drawn, so nothing moves on screen and reduced motion
 * needs no special case. Strong pairs (more shared chats) pull closer; every circle keeps room
 * for its label; the result is scaled to fit the drawing space.
 */
export function layoutGraph(
	nodes: readonly LayoutNode[],
	edges: readonly LayoutEdge[],
	focus: ReadonlySet<string> = new Set()
): GraphLayout {
	const groupsOf = communities(nodes, edges);
	const anchorOf = seeds(groupsOf);
	const groupOf = new Map(groupsOf.flatMap((group, index) => group.map((key) => [key, index])));

	const simNodes: SimNode[] = nodes.map((node) => {
		const anchor = anchorOf.get(node.key) ?? { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 };
		const angle = hash(node.key) * Math.PI * 2;
		return {
			key: node.key,
			radius: node.radius,
			x: anchor.x + Math.cos(angle) * 40,
			y: anchor.y + Math.sin(angle) * 40
		};
	});
	const maxWeight = Math.max(1, ...edges.map((edge) => edge.weight));
	const links: SimLink[] = edges.map((edge) => ({
		source: edge.a,
		target: edge.b,
		weight: edge.weight,
		across: groupOf.get(edge.a) !== groupOf.get(edge.b)
	}));
	const simulation = forceSimulation(simNodes)
		.force(
			'link',
			forceLink<SimNode, SimLink>(links)
				.id((node) => node.key)
				.distance((link) => (link.across ? 160 : 50 + 60 * (1 - link.weight / maxWeight)))
				// A bridge between groups is drawn, but barely pulls: it would fold the groups together.
				.strength((link) => (link.across ? 0.01 : 0.15 + 0.5 * (link.weight / maxWeight)))
		)
		.force('charge', forceManyBody<SimNode>().strength(-180))
		.force(
			'collide',
			forceCollide<SimNode>((node) => node.radius + 16)
		)
		.force('x', forceX<SimNode>(GRAPH_WIDTH / 2).strength(0.05))
		.force('y', forceY<SimNode>(GRAPH_HEIGHT / 2).strength(0.07))
		.stop();
	simulation.tick(300);

	// Fit: the settled positions are scaled uniformly into the drawing space, keeping their shape.
	const xs = simNodes.map((node) => node.x ?? 0);
	const ys = simNodes.map((node) => node.y ?? 0);
	const [minX, maxX, minY, maxY] = [
		Math.min(...xs),
		Math.max(...xs),
		Math.min(...ys),
		Math.max(...ys)
	];
	const scale = Math.min(
		(GRAPH_WIDTH - 2 * MARGIN) / Math.max(1, maxX - minX),
		(GRAPH_HEIGHT - 2 * MARGIN - LABEL_HEIGHT - LEGEND_BAND) / Math.max(1, maxY - minY),
		1.6
	);
	const offsetX = (GRAPH_WIDTH - (maxX - minX) * scale) / 2;
	const offsetY =
		LEGEND_BAND + (GRAPH_HEIGHT - LEGEND_BAND - LABEL_HEIGHT - (maxY - minY) * scale) / 2;
	const placed = new Map<string, PlacedNode>(
		simNodes.map((node) => [
			node.key,
			{
				key: node.key,
				radius: node.radius,
				x: offsetX + ((node.x ?? 0) - minX) * scale,
				y: offsetY + ((node.y ?? 0) - minY) * scale
			}
		])
	);
	return { nodes: placed, labels: placeLabels(nodes, placed, new Set(), focus), groupOf };
}
