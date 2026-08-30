import { blemish, blocking, type DiagramFinding, type Severity } from './finding';
import type { Bounds, DiagramGraph, Edge, Point, Vertex } from './graph';

/**
 * What a professional diagram is, written as things that are simply true of one.
 *
 * Every rule here is parameter-free. That is a constraint, not an accident: these
 * hard-fail, and there is no measured corpus of draw.io geometry to justify a
 * threshold against, so any rule phrased as "at most N crossings" would be a
 * guess wearing a number. Whatever needs a judgement call is declared per case in
 * `expectations.ts` instead, where the diagram's own subject supplies the answer.
 *
 * The one approximation is `edge-clears-vertices`, which reconstructs a route
 * draw.io would render rather than reading one. It is flagged as such below.
 */

export type RuleId =
	| 'valid-drawio'
	| 'edges-anchored'
	| 'vertices-labelled'
	| 'sibling-labels-distinct'
	| 'no-duplicate-edge'
	| 'vertices-do-not-overlap'
	| 'children-within-container'
	| 'positive-extent'
	| 'non-negative-origin'
	| 'longest-word-fits'
	| 'edge-clears-vertices'
	| 'step-badges-contiguous';

export type RuleViolation = DiagramFinding<RuleId>;

export type RuleOutcome =
	| { readonly kind: 'satisfied'; readonly rule: RuleId }
	| (RuleViolation & { readonly kind: 'violated' });

interface Graph {
	readonly vertices: readonly Vertex[];
	readonly edges: readonly Edge[];
}

type Rule = (graph: Graph) => RuleOutcome;

const satisfied = (rule: RuleId): RuleOutcome => ({ kind: 'satisfied', rule });

const violated = (
	rule: RuleId,
	detail: string,
	offenders: readonly string[],
	severity: Severity
): RuleOutcome => ({
	kind: 'violated',
	rule,
	detail,
	offenders,
	severity
});

/**
 * A deliberate under-estimate of glyph width for draw.io's default 12px font.
 * Helvetica averages nearer 0.55em and its digits and capitals are wider still,
 * so a word this test calls too wide is genuinely clipped rather than merely
 * tight.
 */
const NARROWEST_GLYPH_RATIO = 0.5;
const DEFAULT_FONT_SIZE = 12;

const label = (vertex: Vertex): string => vertex.label.trim();

const named = (vertex: Vertex): string => (label(vertex) ? `"${label(vertex)}"` : vertex.id);

const overlaps = (a: Bounds, b: Bounds): boolean =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const contains = (outer: Bounds, inner: Bounds): boolean =>
	inner.x >= outer.x &&
	inner.y >= outer.y &&
	inner.x + inner.width <= outer.x + outer.width &&
	inner.y + inner.height <= outer.y + outer.height;

const ancestry = (vertices: readonly Vertex[]): ReadonlyMap<string, readonly string[]> => {
	const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
	const chains = new Map<string, readonly string[]>();
	for (const vertex of vertices) {
		const chain: string[] = [];
		const seen = new Set<string>([vertex.id]);
		let cursor = byId.get(vertex.parentId);
		while (cursor && !seen.has(cursor.id)) {
			chain.push(cursor.id);
			seen.add(cursor.id);
			cursor = byId.get(cursor.parentId);
		}
		chains.set(vertex.id, chain);
	}
	return chains;
};

/**
 * Does the open segment pass through the open rectangle?
 *
 * Liang-Barsky, with the parallel case rejected on `q <= 0` so a line running
 * exactly along a box's border is not counted as passing through it — that is
 * how a tidy orthogonal route hugging a group boundary looks, and it is fine.
 */
const segmentCrossesBox = (from: Point, to: Point, box: Bounds): boolean => {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const p = [-dx, dx, -dy, dy];
	const q = [
		from.x - box.x,
		box.x + box.width - from.x,
		from.y - box.y,
		box.y + box.height - from.y
	];
	let enter = 0;
	let leave = 1;
	for (let index = 0; index < 4; index += 1) {
		const edge = p[index] ?? 0;
		const distance = q[index] ?? 0;
		if (edge === 0) {
			if (distance <= 0) return false;
			continue;
		}
		const crossing = distance / edge;
		if (edge < 0) enter = Math.max(enter, crossing);
		else leave = Math.min(leave, crossing);
	}
	return enter < leave;
};

const endpointIds = (edge: Edge): readonly string[] =>
	[edge.source, edge.target]
		.filter((end): end is { kind: 'attached'; vertexId: string } => end.kind === 'attached')
		.map((end) => end.vertexId);

const edgesAnchored: Rule = ({ edges }) => {
	const loose = edges.filter(
		(edge) => edge.source.kind !== 'attached' || edge.target.kind !== 'attached'
	);
	return loose.length === 0
		? satisfied('edges-anchored')
		: violated(
				'edges-anchored',
				'An arrow is pinned to a coordinate rather than to a shape. It looks connected and detaches the moment anyone moves the box.',
				loose.map((edge) => edge.id),
				blocking
			);
};

/**
 * A picture inside a shape that already names it is a badge, not a mute shape.
 *
 * Putting a small logo in the corner of a labelled container is how a service
 * boundary wears its brand mark, and the badge has no text because the
 * container's own header supplies it. Reporting it as unlabelled failed a
 * perfectly ordinary diagram.
 *
 * The exemption is deliberately narrow: it needs a *labelled parent*. An icon
 * dropped on the page beside a separate caption box has the layer as its
 * parent, gets no exemption, and is still reported — which is the case worth
 * catching, because the arrows then attach to one half and the other half
 * drifts away when the diagram is edited.
 */
const verticesLabelled: Rule = ({ vertices }) => {
	const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
	// Parented to a labelled shape, or simply drawn inside one. Agents produce
	// both, and to a reader they are the same picture: a logo sitting in the
	// corner of a box that names it.
	const host = (vertex: Vertex): Vertex | undefined =>
		byId.get(vertex.parentId) ??
		vertices.find((other) => other.id !== vertex.id && contains(other.bounds, vertex.bounds));
	const isBadge = (vertex: Vertex): boolean =>
		vertex.image.kind !== 'none' && Boolean(label(host(vertex) ?? vertex));
	const silent = vertices.filter((vertex) => !label(vertex) && !isBadge(vertex));
	return silent.length === 0
		? satisfied('vertices-labelled')
		: violated(
				'vertices-labelled',
				'A shape carries no text, so nothing on the page says what it is.',
				silent.map((vertex) => vertex.id),
				blemish(silent.length)
			);
};

/**
 * Siblings only. The same service drawn inside two different boundaries is two
 * real instances and reads correctly; two identically named boxes side by side
 * leave a reader unable to say which one an arrow meant.
 */
const siblingLabelsDistinct: Rule = ({ vertices }) => {
	const seen = new Map<string, string[]>();
	for (const vertex of vertices) {
		if (!label(vertex)) continue;
		const key = `${vertex.parentId} ${label(vertex).toLocaleLowerCase()}`;
		seen.set(key, [...(seen.get(key) ?? []), vertex.id]);
	}
	const duplicated = [...seen.values()].filter((ids) => ids.length > 1);
	return duplicated.length === 0
		? satisfied('sibling-labels-distinct')
		: violated(
				'sibling-labels-distinct',
				'Two shapes in the same container carry the same label, so an arrow to either is ambiguous.',
				duplicated.flat(),
				blemish(duplicated.length)
			);
};

/**
 * Retracted: `no-self-loop`.
 *
 * It called any edge from a component to itself a defect. The source material
 * says "App Service authenticates the user with its own built-in authentication
 * before the application code sees the request", and the agent drew a self-loop
 * on App Service labelled "built-in authentication" — which is the idiomatic
 * rendering of that sentence, not a mistake. The rule was a preference asserted
 * as an invariant, and the fixtures it was grading actively contradicted it.
 */

const noDuplicateEdge: Rule = ({ edges }) => {
	const seen = new Map<string, string[]>();
	for (const edge of edges) {
		if (edge.source.kind !== 'attached' || edge.target.kind !== 'attached') continue;
		const key = `${edge.source.vertexId} ${edge.target.vertexId} ${edge.label.trim().toLocaleLowerCase()}`;
		seen.set(key, [...(seen.get(key) ?? []), edge.id]);
	}
	const duplicated = [...seen.values()].filter((ids) => ids.length > 1);
	return duplicated.length === 0
		? satisfied('no-duplicate-edge')
		: violated(
				'no-duplicate-edge',
				'The same directed connection is drawn more than once.',
				duplicated.flat(),
				blemish(duplicated.length)
			);
};

const verticesDoNotOverlap: Rule = ({ vertices }) => {
	const chains = ancestry(vertices);
	const collisions: string[] = [];
	const detail: string[] = [];
	for (let i = 0; i < vertices.length; i += 1) {
		for (let j = i + 1; j < vertices.length; j += 1) {
			const a = vertices[i];
			const b = vertices[j];
			if (!a || !b) continue;
			if (chains.get(a.id)?.includes(b.id) || chains.get(b.id)?.includes(a.id)) continue;
			// One box wholly inside another is a boundary drawn around a group,
			// which is the thing we want, not a collision. Only a partial
			// intersection is two shapes fighting over the same space — and this
			// has to be judged on geometry rather than on parenting, because a
			// diagram can draw the grouping correctly while failing to own it.
			// `group-membership` is what reports the missing ownership; saying it
			// again here as "drawn on top of each other" would be false.
			if (contains(a.bounds, b.bounds) || contains(b.bounds, a.bounds)) continue;
			if (!overlaps(a.bounds, b.bounds)) continue;
			collisions.push(a.id, b.id);
			detail.push(`${named(a)} over ${named(b)}`);
		}
	}
	return collisions.length === 0
		? satisfied('vertices-do-not-overlap')
		: violated(
				'vertices-do-not-overlap',
				`Shapes are drawn on top of each other: ${detail.join('; ')}.`,
				[...new Set(collisions)],
				blemish(detail.length)
			);
};

const childrenWithinContainer: Rule = ({ vertices }) => {
	const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
	const escapees = vertices.filter((vertex) => {
		const parent = byId.get(vertex.parentId);
		return parent !== undefined && !contains(parent.bounds, vertex.bounds);
	});
	return escapees.length === 0
		? satisfied('children-within-container')
		: violated(
				'children-within-container',
				'A shape belongs to a boundary group but is drawn outside it, so the grouping the XML claims is not the grouping a reader sees.',
				escapees.map((vertex) => vertex.id),
				blocking
			);
};

const positiveExtent: Rule = ({ vertices }) => {
	const degenerate = vertices.filter(
		(vertex) => vertex.bounds.width <= 0 || vertex.bounds.height <= 0
	);
	return degenerate.length === 0
		? satisfied('positive-extent')
		: violated(
				'positive-extent',
				'A shape has no width or no height, so it renders as a line or not at all.',
				degenerate.map((vertex) => vertex.id),
				blocking
			);
};

const nonNegativeOrigin: Rule = ({ vertices }) => {
	const offPage = vertices.filter((vertex) => vertex.bounds.x < 0 || vertex.bounds.y < 0);
	return offPage.length === 0
		? satisfied('non-negative-origin')
		: violated(
				'non-negative-origin',
				'A shape sits above or left of the page origin, where an export will crop it.',
				offPage.map((vertex) => vertex.id),
				blemish(offPage.length)
			);
};

/**
 * Retracted: `on-grid`.
 *
 * It required every shape's x and y to be a multiple of draw.io's ten-unit grid,
 * on the reasoning that off-grid coordinates cannot line up. Live runs showed
 * the reasoning inverted. The coordinates it flagged were shapes deliberately
 * centred against a taller neighbour — a 120-tall box at y=315 against a
 * 150-tall box at y=300, both centred on 375 — which is a thing well-made
 * diagrams do constantly and which grid-snapping would break. It fired on
 * almost every case, always on one or two cells, and never once named something
 * a reader would notice.
 *
 * Alignment is the property that actually mattered, and there is no
 * parameter-free way to state it: "shares an edge or a centre with some other
 * shape" passes by coincidence once a diagram has a dozen boxes, and anything
 * stricter is a judgement call wearing a number. So the rule is gone rather
 * than loosened. The rules that remain each name something a reader can see.
 */

const longestWordFits: Rule = ({ vertices }) => {
	const clipped = vertices.filter((vertex) => {
		const text = label(vertex);
		if (!text) return false;
		const fontSize = Number(vertex.style.get('fontSize') ?? DEFAULT_FONT_SIZE);
		const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : DEFAULT_FONT_SIZE;
		const longest = Math.max(...text.split(/\s+/).map((word) => word.length));
		return longest * size * NARROWEST_GLYPH_RATIO > vertex.bounds.width;
	});
	return clipped.length === 0
		? satisfied('longest-word-fits')
		: violated(
				'longest-word-fits',
				'A shape is narrower than the longest single word of its own label, so wrapping cannot save it and the word is cut off.',
				clipped.map((vertex) => vertex.id),
				blemish(clipped.length)
			);
};

/**
 * Containers are excluded on purpose: an arrow entering a boundary group must
 * cross that boundary, and the reference diagrams this is modelled on do exactly
 * that.
 */
/**
 * The routes draw.io might actually draw between two shapes.
 *
 * The reconstruction here is a straight line, but `edgeStyle=orthogonalEdgeStyle`
 * — which is what these diagrams use — never draws a diagonal. It turns a
 * corner, and it chooses the turn. Judging an edge on the straight line alone
 * reported crossings the renderer never produces: an arrow between two boxes on
 * different rows was called obstructed by whatever happened to sit on the
 * diagonal between them, when the L-shaped path around it was clear.
 *
 * So the straight line and both single-corner paths are all considered, and an
 * edge counts as obstructed only when every one of them is blocked. An edge
 * carrying explicit waypoints is judged on those alone: the author chose that
 * path and the renderer will follow it.
 */
const routeCandidates = (edge: Edge): readonly (readonly Point[])[] => {
	const from = edge.route[0];
	const to = edge.route[edge.route.length - 1];
	if (edge.route.length !== 2 || !from || !to) return [edge.route];
	return [edge.route, [from, { x: to.x, y: from.y }, to], [from, { x: from.x, y: to.y }, to]];
};

const edgeClearsVertices: Rule = ({ vertices, edges }) => {
	const chains = ancestry(vertices);
	const blocked: string[] = [];
	const detail: string[] = [];
	for (const edge of edges) {
		if (edge.route.length < 2) continue;
		const ends = endpointIds(edge);
		const candidates = routeCandidates(edge);
		for (const vertex of vertices) {
			if (vertex.isContainer) continue;
			// A logo badge is decoration a few dozen pixels across. An arrow passing
			// over one is not something a reader would ever call an obstruction, and
			// reporting it buried the real crossings.
			if (vertex.image.kind !== 'none' && !label(vertex)) continue;
			if (ends.includes(vertex.id)) continue;
			if (ends.some((end) => chains.get(end)?.includes(vertex.id))) continue;
			// ...and anything inside an endpoint. draw.io stops an arrow at the
			// shape's perimeter, but the route reconstructed here runs to its
			// centre, so an arrow into a zone appears to cross whatever the zone
			// holds. The contents of an endpoint are part of that endpoint.
			if (chains.get(vertex.id)?.some((ancestor) => ends.includes(ancestor))) continue;
			// Blocked only if *every* route draw.io might draw is blocked. One clear
			// path is enough, because the renderer will find it.
			const crossed = candidates.every((route) =>
				route.some((point, index) => {
					const next = route[index + 1];
					return next !== undefined && segmentCrossesBox(point, next, vertex.bounds);
				})
			);
			if (!crossed) continue;
			blocked.push(edge.id);
			detail.push(`${edge.id} through ${named(vertex)}`);
		}
	}
	return blocked.length === 0
		? satisfied('edge-clears-vertices')
		: violated(
				'edge-clears-vertices',
				`An arrow is routed straight through a shape it has nothing to do with: ${detail.join('; ')}.`,
				[...new Set(blocked)],
				blemish(detail.length)
			);
};

const STEP_BADGE = /^\d{1,2}$/;

const stepBadgesContiguous: Rule = ({ vertices }) => {
	const badges = vertices.filter((vertex) => STEP_BADGE.test(label(vertex)));
	if (badges.length < 2) return satisfied('step-badges-contiguous');
	const numbers = badges.map((vertex) => Number(label(vertex))).sort((a, b) => a - b);
	const expected = numbers.map((_, index) => index + 1);
	const contiguous = numbers.every((value, index) => value === expected[index]);
	return contiguous
		? satisfied('step-badges-contiguous')
		: violated(
				'step-badges-contiguous',
				`Numbered steps read ${numbers.join(', ')} rather than 1 to ${numbers.length}, so the flow either skips a step or repeats one.`,
				badges.map((vertex) => vertex.id),
				blemish(1)
			);
};

export const DIAGRAM_RULES: readonly Rule[] = [
	edgesAnchored,
	verticesLabelled,
	siblingLabelsDistinct,
	noDuplicateEdge,
	verticesDoNotOverlap,
	childrenWithinContainer,
	positiveExtent,
	nonNegativeOrigin,
	longestWordFits,
	edgeClearsVertices,
	stepBadgesContiguous
];

/**
 * Every rule that a diagram breaks. An empty array is the passing answer, so a
 * case asserts `toEqual([])` and a failure names what broke rather than printing
 * `false`.
 */
export const checkDiagramRules = (graph: DiagramGraph): readonly RuleViolation[] => {
	if (graph.kind === 'failure')
		return [
			{
				rule: 'valid-drawio',
				detail: `Production would refuse to save this diagram: ${graph.reason}`,
				offenders: [],
				severity: blocking
			}
		];
	return DIAGRAM_RULES.map((rule) => rule(graph)).flatMap((outcome) =>
		outcome.kind === 'violated'
			? [
					{
						rule: outcome.rule,
						detail: outcome.detail,
						offenders: outcome.offenders,
						severity: outcome.severity
					}
				]
			: []
	);
};
