import type { ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';

import {
	defaultExportSettings,
	svgViewBoxSize,
	type ExportInput,
	type PreparedDiagram,
	type PreparedExport
} from '$lib/models/deliverables';

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
		diagrams
	};
}
