import type { ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';

import {
	defaultExportSettings,
	svgViewBoxSize,
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
