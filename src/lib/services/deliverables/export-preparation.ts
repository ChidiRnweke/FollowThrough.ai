import type { ProseMirrorDocument, ProseMirrorNode, ProseMirrorTextNode } from '$lib/models/notes';

import {
	defaultExportSettings,
	type DiagramSize,
	type ExportNodePresentation,
	type ExportInput,
	type ExportDiagramReference,
	type PreparedDiagram,
	type PreparedExport
} from '$lib/models/deliverables';

export function exportDiagramReferences(
	document: ProseMirrorDocument
): readonly ExportDiagramReference[] {
	const references: ExportDiagramReference[] = [];
	const walk = (node: ProseMirrorNode): void => {
		if (node.type === 'mermaid') {
			const source = (node.content ?? [])
				.map((child) => (child.type === 'text' ? child.text : ''))
				.join('');
			if (source.trim()) references.push({ kind: 'mermaid', source });
		} else if (node.type === 'drawio' && node.attrs?.diagramId) {
			references.push({ kind: 'drawio', diagramId: node.attrs.diagramId });
		} else if ('content' in node) {
			for (const child of node.content ?? []) walk(child);
		}
	};
	for (const node of document.content ?? []) walk(node);
	return references;
}

/** Every widget a document embeds, in order, so the controller can load and authorize each. */
export function exportWidgetReferences(document: ProseMirrorDocument): readonly string[] {
	const ids: string[] = [];
	const walk = (node: ProseMirrorNode): void => {
		if (node.type === 'widgetNode' && node.attrs?.widgetId) {
			if (!ids.includes(node.attrs.widgetId)) ids.push(node.attrs.widgetId);
		} else if ('content' in node) for (const child of node.content ?? []) walk(child);
	};
	for (const node of document.content ?? []) walk(node);
	return ids;
}

/** Extract the app-owned attachment reference; authorization still belongs to its service. */
export function attachmentIdFromSrc(source: string): string | undefined {
	return /\/api\/attachments\/([^/]+)\/content$/.exec(source)?.[1];
}

/** Sources are discovered before rendering so controllers can authorize app-owned assets. */
export function exportImageSources(doc: ProseMirrorDocument): readonly string[] {
	const sources = new Set<string>();
	const walk = (node: ProseMirrorNode): void => {
		if (node.type === 'image' && typeof node.attrs?.src === 'string') sources.add(node.attrs.src);
		if ('content' in node) for (const child of node.content ?? []) walk(child);
	};
	for (const node of doc.content ?? []) walk(node);
	return [...sources];
}

/** Resolve format-independent values; all external asset work is complete before this call. */
export function prepareExport(input: ExportInput): PreparedExport {
	const images = new Map(input.images);
	for (const note of input.notes)
		for (const source of exportImageSources(note.document))
			if (source.startsWith('data:')) images.set(source, source);
	const diagrams = new Map<string, PreparedDiagram>();
	for (const key of new Set([
		...Object.keys(input.diagramPngs ?? {}),
		...Object.keys(input.diagramSvgs ?? {})
	])) {
		const png = input.diagramPngs?.[key];
		const svg = input.diagramSvgs?.[key];
		const size = input.diagramSizes?.[key] ?? (svg ? svgViewBoxSize(svg) : undefined);
		if (png) diagrams.set(key, { kind: 'raster', data: png, ...(size ? { size } : {}) });
		else if (svg) diagrams.set(key, { kind: 'vector', data: svg, ...(size ? { size } : {}) });
	}
	return {
		nodes: prepareNodes(input.notes.map((note) => note.document)),
		notes: input.notes,
		title: input.title,
		...(input.styles ? { styles: input.styles } : {}),
		settings: input.settings ?? defaultExportSettings,
		images,
		widgets: input.widgets ?? new Map(),
		diagrams,
		// Match the editor's blank line around h1/h2. Deeper headings retain the
		// renderer's native spacing. Values are points; DOCX converts to twips.
		headingSpacing: new Map([
			[1, { before: 18, after: 18 }],
			[2, { before: 15, after: 15 }]
		])
	};
}

/**
 * Natural size of an SVG, from its viewBox.
 *
 * Lives here rather than beside either generator because both sides of the export need it:
 * the browser reads it off its own render to send `diagramSizes`, and the server falls back
 * to it for any caller that still ships the full markup.
 */
export function svgViewBoxSize(svg: string): DiagramSize | undefined {
	const attribute = /(?:^|\s)viewBox\s*=\s*(["'])([^"']*)\1/.exec(svg)?.[2];
	if (attribute === undefined) return undefined;
	const values = attribute.trim().split(/\s*,\s*|\s+/);
	const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
	if (values.length !== 4 || !values.every((value) => number.test(value))) return undefined;
	const viewBox = values.map(Number);
	if (!viewBox.every(Number.isFinite) || viewBox[2]! <= 0 || viewBox[3]! <= 0) return undefined;
	return { width: viewBox[2]!, height: viewBox[3]! };
}

/**
 * Each column's share of the table width, or nothing when the document does not
 * declare a usable width for every column.
 *
 * One value rather than two, because "every column has a width" and "there is a
 * total to divide by" are the same fact. Both renderers used to hold them apart
 * — a `colwidths` array of `number | undefined` beside a `totalWidth` that was
 * `undefined` in exactly the same cases — and both then re-asserted the fact
 * their own guard had already proved, with `(w as number) / totalWidth` inside
 * a `map` the `every` narrowing does not reach.
 *
 * Shares rather than widths, because a PDF divides the content width in points
 * and a DOCX divides it in twips. Sharing the arithmetic is also the point:
 * this ran twice, and a fix to one copy would not have reached the other.
 */
export const columnShares = (
	colwidths: readonly (readonly number[] | null | undefined)[],
	columnCount: number
): readonly number[] | undefined => {
	if (colwidths.length !== columnCount) return undefined;
	const widths: number[] = [];
	for (const declared of colwidths) {
		const width = declared?.[0];
		if (width === undefined || !Number.isFinite(width) || width <= 0) return undefined;
		widths.push(width);
	}
	const total = widths.reduce((sum, width) => sum + width, 0);
	if (Number.isFinite(total)) return widths.map((width) => width / total);
	// Scaling first preserves finite ratios when adding valid widths overflows.
	const maximum = widths.reduce((largest, width) => Math.max(largest, width), 0);
	const scaled = widths.map((width) => width / maximum);
	const scaledTotal = scaled.reduce((sum, width) => sum + width, 0);
	return scaled.map((width) => width / scaledTotal);
};

/** Direct children and inline text use the editor's existing document representation. */
export const documentNodeContent = (node: ProseMirrorNode): readonly ProseMirrorNode[] =>
	'content' in node ? (node.content ?? []) : [];
export function documentInlineText(node: ProseMirrorNode): string {
	return node.type === 'text'
		? node.text
		: documentNodeContent(node).map(documentInlineText).join('');
}
export function documentTextMarks(node: ProseMirrorTextNode): {
	bold: boolean;
	italic: boolean;
	code: boolean;
	href?: string;
} {
	let bold = false,
		italic = false,
		code = false;
	let href: string | undefined;
	for (const mark of node.marks ?? []) {
		if (mark.type === 'bold') bold = true;
		if (mark.type === 'italic') italic = true;
		if (mark.type === 'code') code = true;
		if (mark.type === 'link' && typeof mark.attrs?.href === 'string') href = mark.attrs.href;
	}
	return { bold, italic, code, ...(href !== undefined ? { href } : {}) };
}

function prepareNodes(
	documents: readonly ProseMirrorDocument[]
): ReadonlyMap<ProseMirrorNode, ExportNodePresentation> {
	const nodes = new Map<ProseMirrorNode, ExportNodePresentation>();
	const visit = (node: ProseMirrorNode): void => {
		const children = documentNodeContent(node);
		for (const child of children) visit(child);
		const firstRow =
			node.type === 'table' ? children.find((child) => child.type === 'tableRow') : undefined;
		const cells =
			firstRow && 'content' in firstRow
				? (firstRow.content ?? []).filter(
						(cell) => cell.type === 'tableCell' || cell.type === 'tableHeader'
					)
				: [];
		nodes.set(node, {
			children,
			text:
				node.type === 'text' ? node.text : children.map((child) => nodes.get(child)!.text).join(''),
			marks:
				node.type === 'text'
					? documentTextMarks(node)
					: { bold: false, italic: false, code: false },
			columnShares: cells.length
				? columnShares(
						cells.map((cell) => cell.attrs?.colwidth),
						cells.length
					)
				: undefined
		});
	};
	for (const document of documents) for (const node of document.content ?? []) visit(node);
	return nodes;
}
