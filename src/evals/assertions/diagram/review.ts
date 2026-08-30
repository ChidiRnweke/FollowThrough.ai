import manifest from '../../fixtures/diagrams/icon-manifest.json';
import type { DiagramFinding } from './finding';
import { buildDiagramGraph, type DiagramGraph } from './graph';
import { checkDiagramRules } from './rules';
import { checkDiagramExpectations, type DiagramExpectations } from './expectations';

/**
 * Everything deterministic we can say about a diagram, in one call.
 *
 * The rules and the expectations fail the same way and a case wants one list, so
 * they are concatenated here rather than at every call site. The icon manifest
 * is bound in at the same point: it is a fact about the icon library, not a
 * choice any individual case should be making.
 */
export interface DiagramReview {
	readonly graph: DiagramGraph;
	readonly findings: readonly DiagramFinding[];
}

export const reviewDiagram = (source: string, expectations: DiagramExpectations): DiagramReview => {
	const graph = buildDiagramGraph(source);
	return {
		graph,
		findings: [
			...checkDiagramRules(graph),
			...checkDiagramExpectations(graph, expectations, manifest)
		]
	};
};

/**
 * The whole graph as text, for a failure message.
 *
 * A finding names a rule and a cell id; it cannot say *why* the diagram is
 * shaped the way it is. "Three required edges missing" reads as though the
 * agent drew no arrows, when it may have drawn all three between cells the
 * expectations matched to different boxes — and those are opposite problems.
 * Printing the graph is what tells them apart without another live run.
 */
export const describeGraph = (graph: DiagramGraph): string => {
	if (graph.kind === 'failure') return `invalid: ${graph.reason}`;
	const label = (id: string): string => {
		const vertex = graph.vertices.find((item) => item.id === id);
		return vertex ? `${id}"${vertex.label}"` : id;
	};
	const end = (side: { readonly kind: string; readonly vertexId?: string }): string =>
		side.kind === 'attached' && side.vertexId ? label(side.vertexId) : side.kind;
	const vertices = graph.vertices.map((vertex) => {
		const { x, y, width, height } = vertex.bounds;
		const mark =
			vertex.image.kind === 'iconify'
				? vertex.image.name
				: vertex.image.kind === 'other'
					? 'foreign-image'
					: 'no-icon';
		const role = vertex.isContainer ? ' container' : '';
		return `  ${vertex.id} "${vertex.label}" [${mark}]${role} ${x},${y} ${width}x${height} parent=${vertex.parentId}`;
	});
	const edges = graph.edges.map(
		(edge) => `  ${edge.id} ${end(edge.source)} -> ${end(edge.target)} "${edge.label}"`
	);
	return [
		`vertices (${graph.vertices.length}):`,
		...vertices,
		`edges (${graph.edges.length}):`,
		...edges
	].join('\n');
};

/** Small enough to put in a Phoenix output record beside the findings. */
export const summariseGraph = (graph: DiagramGraph): Record<string, number | string> =>
	graph.kind === 'failure'
		? { kind: 'failure', reason: graph.reason }
		: {
				kind: 'graph',
				vertices: graph.vertices.length,
				containers: graph.vertices.filter((vertex) => vertex.isContainer).length,
				icons: graph.vertices.filter((vertex) => vertex.image.kind === 'iconify').length,
				edges: graph.edges.length
			};
