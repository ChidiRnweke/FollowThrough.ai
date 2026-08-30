import { JSDOM } from 'jsdom';
import { DrawioXmlValidator } from '$lib/server/services/diagrams/drawio';

/**
 * A draw.io document read as geometry rather than as text.
 *
 * `inspectDrawio` answers "what does this diagram say" — labels and directed
 * edges — which is enough to grade faithfulness and nothing else. Whether the
 * picture is usable is a question about shapes and space: do boxes overlap, is a
 * child drawn outside the boundary it belongs to, does an arrow actually attach
 * to anything. None of that survives label extraction, so this builds the model
 * those questions need.
 *
 * The validator runs first, deliberately. Nothing is measured that production
 * would have refused to save, so a rule can never report on a diagram no user
 * could ever have.
 */

export interface Bounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface Point {
	readonly x: number;
	readonly y: number;
}

/**
 * What a cell renders as a picture.
 *
 * `iconify` is separate from `other` because the skill names exactly one source
 * of brand marks, and "an image, but not from the library we told it to use" is
 * the shape of an invented stencil name — which renders as an empty box.
 */
export type VertexImage =
	| { readonly kind: 'iconify'; readonly name: string; readonly url: string }
	| { readonly kind: 'other'; readonly url: string }
	| { readonly kind: 'none' };

export interface Vertex {
	readonly id: string;
	/** HTML-decoded and whitespace-collapsed; draw.io labels come from a rich-text editor. */
	readonly label: string;
	/** Absolute, with the parent chain already resolved. See `absoluteBounds`. */
	readonly bounds: Bounds;
	readonly style: ReadonlyMap<string, string>;
	readonly parentId: string;
	readonly isContainer: boolean;
	readonly image: VertexImage;
}

/**
 * Where an edge ends.
 *
 * Three arms rather than an optional id, because the three cases behave
 * differently and a reader must not be able to confuse them. `attached` moves
 * when the shape moves. `floating` is pinned to a coordinate and merely looks
 * connected until somebody drags the box. `unanchored` is an edge draw.io will
 * place at the origin, which is the signature of geometry the model omitted.
 */
export type EdgeEnd =
	| { readonly kind: 'attached'; readonly vertexId: string }
	| { readonly kind: 'floating'; readonly point: Point }
	| { readonly kind: 'unanchored' };

export interface Edge {
	readonly id: string;
	readonly label: string;
	readonly source: EdgeEnd;
	readonly target: EdgeEnd;
	/**
	 * The polyline we can know: attached ends contribute their shape's centre,
	 * floating ends their fixed point, and declared waypoints sit between them.
	 * It is an approximation of draw.io's router, never its output.
	 */
	readonly route: readonly Point[];
	readonly style: ReadonlyMap<string, string>;
}

export type DiagramGraph =
	| {
			readonly kind: 'graph';
			readonly vertices: readonly Vertex[];
			readonly edges: readonly Edge[];
	  }
	| { readonly kind: 'failure'; readonly reason: string };

/**
 * Iconify serves the same icon two ways, and both are real.
 *
 * `/logos/microsoft-azure.svg` is the documented form; `/mdi:microsoft-azure.svg`
 * answers 200 with the identical SVG. Matching only the first classified a
 * perfectly good brand mark as an image from an untrusted source and reported a
 * correct diagram as carrying a broken icon. Verified against the live endpoint
 * rather than assumed.
 */
const ICONIFY_URL = /^https:\/\/api\.iconify\.design\/([a-z0-9-]+)[/:]([a-z0-9-]+)\.svg$/i;

/** `rounded=1;shape=image;image=…;html=1` → a map, with bare tokens mapping to ''. */
export const parseStyle = (style: string): ReadonlyMap<string, string> => {
	const entries = new Map<string, string>();
	for (const token of style.split(';')) {
		const trimmed = token.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf('=');
		if (separator === -1) entries.set(trimmed, '');
		else entries.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim());
	}
	return entries;
};

const imageOf = (style: ReadonlyMap<string, string>): VertexImage => {
	// Keyed on `image` rather than `shape=image`: draw.io renders the picture
	// either way, and this is the permissive reading, so an icon rule can only
	// ever under-report.
	const url = style.get('image');
	if (!url) return { kind: 'none' };
	const match = ICONIFY_URL.exec(url);
	if (!match?.[1] || !match[2]) return { kind: 'other', url };
	return { kind: 'iconify', name: `${match[1]}:${match[2]}`, url };
};

const childNamed = (element: Element, name: string): Element | undefined =>
	Array.from(element.children).find((child) => child.nodeName === name);

const numberAttribute = (element: Element | undefined, name: string): number => {
	const raw = element?.getAttribute(name);
	if (raw === null || raw === undefined || !raw.trim()) return 0;
	const value = Number(raw);
	// The production validator has already rejected non-finite geometry, so this
	// branch is only reachable for an attribute it does not police.
	return Number.isFinite(value) ? value : 0;
};

const pointNamed = (geometry: Element | undefined, as: string): Point | undefined => {
	if (!geometry) return undefined;
	const point = Array.from(geometry.children).find(
		(child) => child.nodeName === 'mxPoint' && child.getAttribute('as') === as
	);
	if (!point) return undefined;
	return { x: numberAttribute(point, 'x'), y: numberAttribute(point, 'y') };
};

const waypoints = (geometry: Element | undefined): readonly Point[] => {
	if (!geometry) return [];
	const array = Array.from(geometry.children).find(
		(child) => child.nodeName === 'Array' && child.getAttribute('as') === 'points'
	);
	if (!array) return [];
	return Array.from(array.children)
		.filter((child) => child.nodeName === 'mxPoint')
		.map((point) => ({ x: numberAttribute(point, 'x'), y: numberAttribute(point, 'y') }));
};

export const centreOf = (bounds: Bounds): Point => ({
	x: bounds.x + bounds.width / 2,
	y: bounds.y + bounds.height / 2
});

/**
 * A cell carrying rich text is wrapped: `<object id label><mxCell …/></object>`,
 * and the id and label live on the wrapper while everything else lives on the
 * cell. Reading only the cell loses the label and the id together.
 */
const wrapperOf = (cell: Element): Element | undefined => {
	const parent = cell.parentElement;
	if (!parent) return undefined;
	return parent.nodeName === 'object' || parent.nodeName === 'UserObject' ? parent : undefined;
};

interface RawCell {
	readonly id: string;
	readonly label: string;
	readonly parentId: string;
	readonly style: ReadonlyMap<string, string>;
	readonly geometry: Element | undefined;
	readonly isVertex: boolean;
	readonly isEdge: boolean;
	readonly sourceId: string | undefined;
	readonly targetId: string | undefined;
}

const readCells = (document: Document, decode: (html: string) => string): readonly RawCell[] =>
	Array.from(document.querySelectorAll('mxCell')).flatMap((cell) => {
		const wrapper = wrapperOf(cell);
		const id = cell.getAttribute('id') ?? wrapper?.getAttribute('id');
		if (!id) return [];
		// First non-empty, not first non-null: a wrapped cell carries `value=""`
		// beside a wrapper that holds the real label.
		const rawLabel =
			[
				cell.getAttribute('value'),
				wrapper?.getAttribute('label'),
				wrapper?.getAttribute('value')
			].find((candidate) => candidate?.trim()) ?? '';
		return [
			{
				id,
				label: decode(rawLabel),
				parentId: cell.getAttribute('parent') ?? '',
				style: parseStyle(cell.getAttribute('style') ?? ''),
				geometry: childNamed(cell, 'mxGeometry'),
				isVertex: cell.getAttribute('vertex') === '1',
				isEdge: cell.getAttribute('edge') === '1',
				sourceId: cell.getAttribute('source') ?? undefined,
				targetId: cell.getAttribute('target') ?? undefined
			}
		];
	});

/**
 * Resolve a cell's geometry against its ancestors.
 *
 * This is the whole reason the builder exists and the easiest thing to get
 * wrong: a child's `mxGeometry` x/y is an offset from its **parent vertex's**
 * origin, not a page coordinate. Read them as page coordinates and every
 * containment and overlap answer is confidently wrong — a group's children all
 * appear clustered at the top-left, outside the group that holds them.
 *
 * The layer cell (`1`) and the root (`0`) carry no geometry and contribute
 * nothing, so a top-level shape resolves to its own x/y.
 */
const absoluteBounds = (cells: ReadonlyMap<string, RawCell>): ReadonlyMap<string, Bounds> => {
	const resolved = new Map<string, Bounds>();
	const inProgress = new Set<string>();

	const originOf = (id: string): Point => {
		const cell = cells.get(id);
		if (!cell || !cell.isVertex) return { x: 0, y: 0 };
		const bounds = boundsOf(id);
		return { x: bounds.x, y: bounds.y };
	};

	function boundsOf(id: string): Bounds {
		const cached = resolved.get(id);
		if (cached) return cached;
		const cell = cells.get(id);
		const local = {
			x: numberAttribute(cell?.geometry, 'x'),
			y: numberAttribute(cell?.geometry, 'y'),
			width: numberAttribute(cell?.geometry, 'width'),
			height: numberAttribute(cell?.geometry, 'height')
		};
		// A parent cycle is impossible in a document the validator accepted, but
		// resolving one would hang rather than fail, so it is cut here and the
		// cell is measured as if it were top-level.
		if (!cell || inProgress.has(id)) return local;
		inProgress.add(id);
		const origin = originOf(cell.parentId);
		inProgress.delete(id);
		const absolute = { ...local, x: local.x + origin.x, y: local.y + origin.y };
		resolved.set(id, absolute);
		return absolute;
	}

	for (const id of cells.keys()) boundsOf(id);
	return resolved;
};

const endOf = (
	vertexId: string | undefined,
	vertices: ReadonlySet<string>,
	point: Point | undefined
): EdgeEnd => {
	if (vertexId && vertices.has(vertexId)) return { kind: 'attached', vertexId };
	if (point) return { kind: 'floating', point };
	return { kind: 'unanchored' };
};

const pointOf = (end: EdgeEnd, bounds: ReadonlyMap<string, Bounds>): Point | undefined => {
	if (end.kind === 'floating') return end.point;
	if (end.kind === 'unanchored') return undefined;
	const box = bounds.get(end.vertexId);
	return box ? centreOf(box) : undefined;
};

/**
 * Where a segment leaving a shape's centre actually crosses its border.
 *
 * draw.io draws an edge between the *perimeters* of the two shapes it joins;
 * the polyline reconstructed here starts at their centres, and that difference
 * is not cosmetic. An arrow into a boundary group ran from outside, through the
 * border, and on across everything the group contained before reaching the
 * middle — so a rule looking for obstructions reported the group's own contents
 * as things the arrow had no business crossing. Clipping each end back to the
 * border is what makes the route resemble the one a reader sees.
 */
const leavingPoint = (centre: Point, towards: Point, box: Bounds): Point => {
	const dx = towards.x - centre.x;
	const dy = towards.y - centre.y;
	if (dx === 0 && dy === 0) return centre;
	const spans = [
		dx > 0 ? (box.x + box.width - centre.x) / dx : dx < 0 ? (box.x - centre.x) / dx : Infinity,
		dy > 0 ? (box.y + box.height - centre.y) / dy : dy < 0 ? (box.y - centre.y) / dy : Infinity
	];
	const exit = Math.min(...spans.filter((value) => value > 0), 1);
	return { x: centre.x + dx * exit, y: centre.y + dy * exit };
};

/** Build the geometric model, after the production boundary has accepted the source. */
export const buildDiagramGraph = (source: string): DiagramGraph => {
	let validated: string;
	try {
		validated = new DrawioXmlValidator().validate(source);
	} catch (error) {
		return { kind: 'failure', reason: error instanceof Error ? error.message : String(error) };
	}

	const xml = new JSDOM(validated, { contentType: 'text/xml' });
	const html = new JSDOM('').window.document;
	try {
		// Runs of spaces collapse, line breaks survive. A label's first line is the
		// component's name and the rest is description, and flattening the two
		// together let a word from one component's description be mistaken for
		// another component's name.
		const decode = (value: string): string => {
			html.body.innerHTML = value;
			return (html.body.textContent ?? '')
				.replace(/[^\S\n]+/g, ' ')
				.replace(/\s*\n\s*/g, '\n')
				.trim();
		};
		const cells = readCells(xml.window.document, decode);
		const byId = new Map(cells.map((cell) => [cell.id, cell]));
		const bounds = absoluteBounds(byId);
		const vertexIds = new Set(cells.filter((cell) => cell.isVertex).map((cell) => cell.id));
		const edgeIds = new Set(cells.filter((cell) => cell.isEdge).map((cell) => cell.id));
		const parentsWithVertexChildren = new Set(
			cells
				.filter((cell) => cell.isVertex && vertexIds.has(cell.parentId))
				.map((cell) => cell.parentId)
		);

		/**
		 * An edge's caption is a `vertex` cell parented to the edge, and draw.io
		 * gives it a relative geometry with no size at all. It is not a shape: it
		 * has no width to overflow, no position to align, and nothing to collide
		 * with. Left in, every properly labelled connector fails `positive-extent`,
		 * `longest-word-fits` and `on-grid` at once — which is a report about
		 * draw.io's data model rather than about the diagram.
		 */
		const shapes = cells.filter((cell) => cell.isVertex && !edgeIds.has(cell.parentId));

		const boundsOf = (cell: { readonly id: string }): Bounds =>
			bounds.get(cell.id) ?? { x: 0, y: 0, width: 0, height: 0 };

		/**
		 * A boundary group need not own its children.
		 *
		 * `container=1` and real parenting are how draw.io *should* express a
		 * grouping, and `group-membership` is the check that says so. But a box
		 * drawn around other boxes is visibly a region whether or not the XML
		 * agrees, and for layout questions that is what matters: an arrow entering
		 * it is entering a region, not colliding with a component.
		 */
		const surroundsAnother = (cell: { readonly id: string }): boolean => {
			const outer = boundsOf(cell);
			if (outer.width <= 0 || outer.height <= 0) return false;
			return shapes.some((other) => {
				if (other.id === cell.id) return false;
				const inner = boundsOf(other);
				return (
					inner.width > 0 &&
					inner.height > 0 &&
					inner.x >= outer.x &&
					inner.y >= outer.y &&
					inner.x + inner.width <= outer.x + outer.width &&
					inner.y + inner.height <= outer.y + outer.height
				);
			});
		};

		const vertices = shapes.map((cell) => ({
			id: cell.id,
			label: cell.label,
			bounds: boundsOf(cell),
			style: cell.style,
			parentId: cell.parentId,
			isContainer:
				parentsWithVertexChildren.has(cell.id) ||
				cell.style.get('container') === '1' ||
				surroundsAnother(cell),
			image: imageOf(cell.style)
		}));

		const edges = cells
			.filter((cell) => cell.isEdge)
			.map((cell) => {
				const source = endOf(cell.sourceId, vertexIds, pointNamed(cell.geometry, 'sourcePoint'));
				const target = endOf(cell.targetId, vertexIds, pointNamed(cell.geometry, 'targetPoint'));
				const start = pointOf(source, bounds);
				const finish = pointOf(target, bounds);
				const through = waypoints(cell.geometry);
				const sourceBox = source.kind === 'attached' ? bounds.get(source.vertexId) : undefined;
				const targetBox = target.kind === 'attached' ? bounds.get(target.vertexId) : undefined;
				const first = through[0] ?? finish;
				const last = through[through.length - 1] ?? start;
				const from = start && sourceBox && first ? leavingPoint(start, first, sourceBox) : start;
				const to = finish && targetBox && last ? leavingPoint(finish, last, targetBox) : finish;
				return {
					id: cell.id,
					label: cell.label,
					source,
					target,
					route: [...(from ? [from] : []), ...through, ...(to ? [to] : [])],
					style: cell.style
				};
			});

		return { kind: 'graph', vertices, edges };
	} finally {
		xml.window.close();
		html.defaultView?.close();
	}
};
