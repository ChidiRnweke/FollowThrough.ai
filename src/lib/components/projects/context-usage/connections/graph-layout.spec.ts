import { describe, expect, it } from 'vitest';
import {
	GRAPH_HEIGHT,
	GRAPH_WIDTH,
	layoutGraph,
	type LayoutEdge,
	type LayoutNode
} from './graph-layout';

/** A dense project: two clusters of twelve, every pair inside a cluster read together. */
const cluster = (name: string, offset: number): LayoutNode[] =>
	Array.from({ length: 12 }, (_, index) => ({
		key: `${name}${index}`,
		radius: 6 + (index % 4) * 4,
		label: `${name} research note number ${index}`,
		rank: offset + index
	}));
const nodes = [...cluster('soil', 0), ...cluster('water', 12)];
const edges: LayoutEdge[] = ['soil', 'water'].flatMap((name) =>
	Array.from({ length: 12 }, (_, a) =>
		Array.from({ length: 12 - a - 1 }, (_, step) => ({
			a: `${name}${a}`,
			b: `${name}${a + step + 1}`,
			weight: 1 + ((a + step) % 3)
		}))
	).flat()
);

describe('graph layout', () => {
	it('lays out the same graph the same way every time', () => {
		const first = layoutGraph(nodes, edges);
		const second = layoutGraph(nodes, edges);
		expect([...second.nodes.values()]).toEqual([...first.nodes.values()]);
	});

	it('keeps every circle inside the drawing space', () => {
		const placed = [...layoutGraph(nodes, edges).nodes.values()];
		const outside = placed.filter(
			(node) =>
				node.x - node.radius < 0 ||
				node.y - node.radius < 0 ||
				node.x + node.radius > GRAPH_WIDTH ||
				node.y + node.radius > GRAPH_HEIGHT
		);
		expect(outside).toEqual([]);
	});

	it('keeps two unrelated clusters apart', () => {
		const placed = layoutGraph(nodes, edges).nodes;
		const box = (name: string) => {
			const members = [...placed.values()].filter((node) => node.key.startsWith(name));
			return {
				left: Math.min(...members.map((node) => node.x)),
				right: Math.max(...members.map((node) => node.x)),
				top: Math.min(...members.map((node) => node.y)),
				bottom: Math.max(...members.map((node) => node.y))
			};
		};
		const soil = box('soil');
		const water = box('water');
		const overlap =
			soil.left < water.right &&
			water.left < soil.right &&
			soil.top < water.bottom &&
			water.top < soil.bottom;
		expect(overlap).toBe(false);
	});

	it('never draws two labels over each other', () => {
		const { labels } = layoutGraph(nodes, edges);
		const collisions = labels.filter((label, index) =>
			labels.some(
				(other, otherIndex) =>
					otherIndex !== index &&
					Math.abs(other.y - label.y) < 13 &&
					Math.abs(other.x - label.x) < (other.text.length + label.text.length) * 3
			)
		);
		expect(collisions).toEqual([]);
	});

	it('labels a focused item even when its label had no room', () => {
		const unfocused = layoutGraph(nodes, edges).labels.map((label) => label.key);
		const hidden = nodes.find((node) => !unfocused.includes(node.key));
		const focused = layoutGraph(nodes, edges, new Set(hidden ? [hidden.key] : []));
		expect(focused.labels.map((label) => label.key)).toContain(hidden?.key);
	});
});
