import { blocking, type DiagramFinding } from './finding';
import type { DiagramGraph, Vertex } from './graph';

/**
 * What a *particular* diagram must show, declared by the case that asks for it.
 *
 * The rules in `rules.ts` are true of every professional diagram and so can be
 * parameter-free. Everything else a reviewer would check — is the Search service
 * actually on the page, does the request really flow from the app to the agent
 * service, does the model sit inside the project boundary, is there a logo on
 * the box rather than a grey rectangle — depends on the subject. Those answers
 * come from the source material, so the fixture states them and the check is
 * exact rather than statistical.
 *
 * This is the deterministic counterpart to the rubric judge, which is kept
 * alongside it: the judge reads intent, these read the graph.
 */

export type ExpectationId =
	| 'components-present'
	| 'required-edges'
	| 'forbidden-edges'
	| 'icons-present'
	| 'icons-brand-match'
	| 'icons-resolvable'
	| 'group-membership';

/**
 * Every expectation blocks.
 *
 * These are the checks that ask whether the diagram is *of the system the
 * source describes* — the right components, the stated connections, the ones
 * ruled out, the real boundaries, and each product wearing its own mark. A
 * diagram that gets any of those wrong is not an untidy diagram, it is a
 * diagram of something else, and no amount of tidiness elsewhere redeems it.
 * The graded budget belongs to `rules.ts`, where the findings are about how the
 * page reads rather than what it says.
 */
export type ExpectationViolation = DiagramFinding<ExpectationId>;

export interface ExpectedEdge {
	readonly from: string;
	readonly to: string;
}

/**
 * A product box, and the marks that actually identify that product.
 *
 * `iconBearing` used to be a list of names and the check asked only whether the
 * box carried *an* icon. It passed `material-symbols:table` standing in for
 * Azure Table Storage and `mdi:application-outline` standing in for a client —
 * generic pictograms wearing the place of a logo, which is the exact thing a
 * branded architecture diagram must not do, and the check could not see it.
 *
 * `brands` are tokens that must appear in the icon's own name. Several are
 * allowed because more than one mark can legitimately identify one product: the
 * Azure logo and the OpenAI logo are both honest choices for an Azure OpenAI
 * deployment. They are brand words, never category words — "search" would let a
 * magnifying-glass pictogram back in, so Azure AI Search asks for "azure".
 */
export interface ExpectedIcon {
	readonly component: string;
	readonly brands: readonly string[];
}

export interface ExpectedGroup {
	/** The boundary's own label, e.g. "Microsoft Foundry project". */
	readonly boundary: string;
	readonly members: readonly string[];
}

export interface DiagramExpectations {
	/** Every component the source material names, as it should appear on the page. */
	readonly components: readonly string[];
	readonly edges: readonly ExpectedEdge[];
	/**
	 * Pairs the source says are connected without fixing which way the arrow
	 * points. "The Loader module downloads the model file from Azure Blob
	 * Storage" is true of an arrow drawn either way: one reads as the request,
	 * the other as the data coming back, and both are ordinary practice. Keeping
	 * these in their own list means `edges` stays strictly directional for the
	 * relationships where direction is the fact being asserted.
	 */
	readonly connections: readonly ExpectedEdge[];
	/** Connections the source explicitly rules out. */
	readonly forbiddenEdges: readonly ExpectedEdge[];
	/** Components that are products or services and must therefore carry a brand mark. */
	readonly iconBearing: readonly ExpectedIcon[];
	readonly groups: readonly ExpectedGroup[];
}

/**
 * Iconify collections whose full contents we hold, so a name inside one can be
 * confirmed to exist. A name from any other collection is left alone rather than
 * guessed at — see `icons-resolvable`.
 */
export interface IconManifest {
	readonly collections: Readonly<Record<string, readonly string[]>>;
}

const normalise = (value: string): string => value.toLocaleLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Substring rather than equality, because a component named "Azure AI Search"
 * legitimately appears as "Azure AI Search index". Matching the other way round
 * — expecting the label to contain the component — keeps a diagram from passing
 * by labelling a box with a single shared word.
 */
const matches = (vertex: Vertex, component: string): boolean =>
	normalise(vertex.label).includes(normalise(component));

/**
 * The first line of a draw.io label is the component's name; anything after it
 * is description.
 *
 * Matching anywhere in the label let a coincidental word in someone else's
 * description win. "Azure Data Lake Storage\nProduction data" was matched for
 * the component "Production" and beat the box actually named Production, which
 * reported three connections missing on a diagram that drew all three. Titles
 * are tried first, and only if no title matches does the whole label count.
 */
const titleOf = (vertex: Vertex): string =>
	// Either a real line break or the literal two-character escape, because the
	// agent writes `\n` inside a quoted label and draw.io renders it as a break.
	vertex.label.split(/\\n|\n/)[0] ?? '';

/**
 * The most specific box wins, not the first one encountered.
 *
 * Titles are tried before whole labels so a word in one component's description
 * cannot claim another component's name. Among titles that match, the shortest
 * wins: a diagram headed "Azure OpenAI chat architecture" contains that phrase
 * in a decorative heading as well as in the box named "Azure OpenAI model", and
 * first-match handed the component to the heading — reporting a fully branded
 * model box as a bare rectangle because the heading has no logo on it.
 */
const shortest = (
	candidates: readonly Vertex[],
	key: (vertex: Vertex) => string
): Vertex | undefined =>
	candidates.reduce<Vertex | undefined>(
		(best, vertex) => (!best || key(vertex).length < key(best).length ? vertex : best),
		undefined
	);

const findVertex = (vertices: readonly Vertex[], component: string): Vertex | undefined => {
	const wanted = normalise(component);
	const byTitle = vertices.filter((vertex) => normalise(titleOf(vertex)).includes(wanted));
	if (byTitle.length) return shortest(byTitle, titleOf);
	return shortest(
		vertices.filter((vertex) => matches(vertex, component)),
		(vertex) => vertex.label
	);
};

const componentsPresent = (
	vertices: readonly Vertex[],
	expected: readonly string[]
): readonly ExpectationViolation[] => {
	const missing = expected.filter((component) => !findVertex(vertices, component));
	return missing.length === 0
		? []
		: [
				{
					rule: 'components-present',
					detail: `The source names components the diagram never draws: ${missing.join(', ')}.`,
					offenders: [],
					severity: blocking
				}
			];
};

const connections = (graph: Extract<DiagramGraph, { kind: 'graph' }>): ReadonlySet<string> => {
	const byId = new Map(graph.vertices.map((vertex) => [vertex.id, vertex]));
	const pairs = new Set<string>();
	for (const edge of graph.edges) {
		if (edge.source.kind !== 'attached' || edge.target.kind !== 'attached') continue;
		const from = byId.get(edge.source.vertexId);
		const to = byId.get(edge.target.vertexId);
		if (from && to) pairs.add(`${from.id} ${to.id}`);
	}
	return pairs;
};

/**
 * A component and everything drawn inside it.
 *
 * A service is often drawn as a zone holding its own parts — Azure AI Search as
 * a box containing two indexers and the index they write to — and the arrows
 * then land on the parts rather than on the zone. That is the more accurate
 * drawing, not a worse one, and demanding a direct cell-to-cell edge failed it:
 * three required connections reported missing on a diagram that drew all three.
 * A boundary and its contents are the same component at different zoom levels,
 * so an edge touching either end of that nesting counts.
 *
 * The same widening makes `forbidden-edges` stricter rather than looser, which
 * is the right direction: if the source says these two never talk, an arrow from
 * one into the other's zone is exactly what it rules out.
 */
const withDescendants = (vertices: readonly Vertex[], root: Vertex): ReadonlySet<string> => {
	const family = new Set<string>([root.id]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const vertex of vertices) {
			if (family.has(vertex.id) || !family.has(vertex.parentId)) continue;
			family.add(vertex.id);
			grew = true;
		}
	}
	return family;
};

const connected = (
	graph: Extract<DiagramGraph, { kind: 'graph' }>,
	pairs: ReadonlySet<string>,
	edge: ExpectedEdge
): boolean => {
	const from = findVertex(graph.vertices, edge.from);
	const to = findVertex(graph.vertices, edge.to);
	if (!from || !to) return false;
	for (const source of withDescendants(graph.vertices, from))
		for (const target of withDescendants(graph.vertices, to))
			if (pairs.has(`${source} ${target}`)) return true;
	return false;
};

const requiredEdges = (
	graph: Extract<DiagramGraph, { kind: 'graph' }>,
	expected: readonly ExpectedEdge[]
): readonly ExpectationViolation[] => {
	const pairs = connections(graph);
	const missing = expected.filter((edge) => !connected(graph, pairs, edge));
	return missing.length === 0
		? []
		: [
				{
					rule: 'required-edges',
					detail: `The source states connections the diagram does not draw: ${missing.map((edge) => `${edge.from} → ${edge.to}`).join(', ')}.`,
					offenders: [],
					severity: blocking
				}
			];
};

const eitherWayEdges = (
	graph: Extract<DiagramGraph, { kind: 'graph' }>,
	expected: readonly ExpectedEdge[]
): readonly ExpectationViolation[] => {
	const pairs = connections(graph);
	const missing = expected.filter(
		(edge) =>
			!connected(graph, pairs, edge) && !connected(graph, pairs, { from: edge.to, to: edge.from })
	);
	return missing.length === 0
		? []
		: [
				{
					rule: 'required-edges',
					detail: `The source connects these and the diagram joins them in neither direction: ${missing.map((edge) => `${edge.from} — ${edge.to}`).join(', ')}.`,
					offenders: [],
					severity: blocking
				}
			];
};

const forbiddenEdges = (
	graph: Extract<DiagramGraph, { kind: 'graph' }>,
	forbidden: readonly ExpectedEdge[]
): readonly ExpectationViolation[] => {
	const pairs = connections(graph);
	const invented = forbidden.filter((edge) => connected(graph, pairs, edge));
	return invented.length === 0
		? []
		: [
				{
					rule: 'forbidden-edges',
					detail: `The diagram draws connections the source rules out: ${invented.map((edge) => `${edge.from} → ${edge.to}`).join(', ')}.`,
					offenders: [],
					severity: blocking
				}
			];
};

/**
 * A product box with no logo is the grey-rectangle diagram the skill exists to
 * prevent, and an image from anywhere but the icon library is the shape of an
 * invented stencil name — which renders as an empty box the model cannot see.
 */
/**
 * Comparison ignores separators and case, because the same brand is spelled
 * differently in different collections: `logos:microsoft-power-bi` and
 * `simple-icons:powerbi` are the same mark, and both must match "power bi".
 */
const brandKey = (value: string): string => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');

const wearsBrand = (iconName: string, brands: readonly string[]): boolean => {
	const key = brandKey(iconName);
	return brands.some((brand) => key.includes(brandKey(brand)));
};

const enclosedBy = (outer: Vertex, inner: Vertex): boolean =>
	inner.id !== outer.id &&
	inner.bounds.x >= outer.bounds.x &&
	inner.bounds.y >= outer.bounds.y &&
	inner.bounds.x + inner.bounds.width <= outer.bounds.x + outer.bounds.width &&
	inner.bounds.y + inner.bounds.height <= outer.bounds.y + outer.bounds.height;

/**
 * The component, everything parented to it, and everything drawn inside it.
 *
 * A logo badge is often placed in the corner of a box without being parented to
 * it. The reader sees one component wearing its mark either way, so the mark
 * counts either way; reading only the parent chain reported a fully branded
 * diagram as a row of grey rectangles.
 */
const familyOf = (vertices: readonly Vertex[], root: Vertex): readonly Vertex[] => {
	const owned = withDescendants(vertices, root);
	return vertices.filter((item) => owned.has(item.id) || enclosedBy(root, item));
};

const iconsPresent = (
	vertices: readonly Vertex[],
	expected: readonly ExpectedIcon[]
): readonly ExpectationViolation[] => {
	const bare: string[] = [];
	const foreign: Vertex[] = [];
	const substituted: string[] = [];
	for (const wanted of expected) {
		const vertex = findVertex(vertices, wanted.component);
		if (!vertex) continue; // already reported by components-present
		// A component drawn as a zone wears its mark on the zone or on something
		// inside it — the search service's icon can sit on the index it holds.
		const family = familyOf(vertices, vertex);
		const marks = family.flatMap((item) =>
			item.image.kind === 'iconify' ? [item.image.name] : []
		);
		if (marks.some((name) => wearsBrand(name, wanted.brands))) continue;
		if (marks.length)
			substituted.push(
				`${wanted.component} wears ${marks.join(', ')} rather than ${wanted.brands.join(' or ')}`
			);
		else {
			const marked = family.find((item) => item.image.kind === 'other');
			if (marked) foreign.push(marked);
			else bare.push(wanted.component);
		}
	}
	const violations: ExpectationViolation[] = [];
	if (bare.length)
		violations.push({
			rule: 'icons-present',
			detail: `Product boxes are drawn as plain rectangles with no brand mark: ${bare.join(', ')}.`,
			offenders: [],
			severity: blocking
		});
	if (foreign.length)
		violations.push({
			rule: 'icons-present',
			detail: `Images come from somewhere other than the icon library the tool provides: ${foreign.map((vertex) => (vertex.image.kind === 'other' ? vertex.image.url : vertex.id)).join(', ')}.`,
			offenders: foreign.map((vertex) => vertex.id),
			severity: blocking
		});
	if (substituted.length)
		violations.push({
			rule: 'icons-brand-match',
			detail: `A generic pictogram stands where the product's own logo belongs: ${substituted.join('; ')}.`,
			offenders: [],
			severity: blocking
		});
	return violations;
};

/**
 * A well-formed icon URL can still 404, and a 404 renders as an empty box.
 *
 * Checked against the collections we hold in full, and only those: a name whose
 * collection is not in the manifest is not judged, because the alternative is
 * failing a real icon on the strength of a list we never fetched.
 */
const iconsResolvable = (
	vertices: readonly Vertex[],
	manifest: IconManifest
): readonly ExpectationViolation[] => {
	const broken = vertices.filter((vertex) => {
		if (vertex.image.kind !== 'iconify') return false;
		const [prefix, name] = vertex.image.name.split(':');
		if (!prefix || !name) return true;
		const collection = manifest.collections[prefix];
		return collection !== undefined && !collection.includes(name);
	});
	return broken.length === 0
		? []
		: [
				{
					rule: 'icons-resolvable',
					detail: `Icon names do not exist in their library and will render as empty boxes: ${broken.map((vertex) => (vertex.image.kind === 'iconify' ? vertex.image.name : vertex.id)).join(', ')}.`,
					offenders: broken.map((vertex) => vertex.id),
					severity: blocking
				}
			];
};

/**
 * Membership is read from the parent chain, not from geometry. A shape merely
 * drawn on top of a boundary is not in it: it moves independently and exports
 * wrong, which is precisely the difference between a diagram that survives
 * editing and one that only looks right in a screenshot. `children-within-
 * container` separately insists the two readings agree.
 */
const groupMembership = (
	vertices: readonly Vertex[],
	groups: readonly ExpectedGroup[]
): readonly ExpectationViolation[] => {
	const byId = new Map(vertices.map((vertex) => [vertex.id, vertex]));
	const violations: ExpectationViolation[] = [];
	for (const group of groups) {
		const boundary = findVertex(vertices, group.boundary);
		if (!boundary) {
			violations.push({
				rule: 'group-membership',
				detail: `The source describes a "${group.boundary}" boundary and the diagram has no such container.`,
				offenders: [],
				severity: blocking
			});
			continue;
		}
		const escaped = group.members.filter((member) => {
			const vertex = findVertex(vertices, member);
			if (!vertex) return false; // already reported by components-present
			const chain = new Set<string>([vertex.id]);
			let cursor = byId.get(vertex.parentId);
			while (cursor && !chain.has(cursor.id)) {
				if (cursor.id === boundary.id) return false;
				chain.add(cursor.id);
				cursor = byId.get(cursor.parentId);
			}
			return true;
		});
		if (escaped.length)
			violations.push({
				rule: 'group-membership',
				detail: `Components belong inside "${group.boundary}" but are not parented to it: ${escaped.join(', ')}.`,
				offenders: [boundary.id],
				severity: blocking
			});
	}
	return violations;
};

export const checkDiagramExpectations = (
	graph: DiagramGraph,
	expectations: DiagramExpectations,
	manifest: IconManifest
): readonly ExpectationViolation[] => {
	if (graph.kind === 'failure') return [];
	return [
		...componentsPresent(graph.vertices, expectations.components),
		...requiredEdges(graph, expectations.edges),
		...eitherWayEdges(graph, expectations.connections),
		...forbiddenEdges(graph, expectations.forbiddenEdges),
		...iconsPresent(graph.vertices, expectations.iconBearing),
		...iconsResolvable(graph.vertices, manifest),
		...groupMembership(graph.vertices, expectations.groups)
	];
};
