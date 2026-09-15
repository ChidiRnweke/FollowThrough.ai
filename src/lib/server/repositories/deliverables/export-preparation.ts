import type { ProseMirrorDocument } from '$lib/models/notes';
import {
	defaultExportSettings,
	type DiagramRenders,
	type DiagramSize,
	type ExportSettings,
	type ExtractedTemplateStyles
} from '$lib/models/deliverables';
import {
	collectImageSources,
	fetchImages,
	svgDimensions,
	type ImageSourceResolver
} from './export-images';
export interface ExportInput extends DiagramRenders {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly styles?: ExtractedTemplateStyles;
	readonly settings?: ExportSettings;
	readonly imageResolver?: ImageSourceResolver;
}
export type PreparedDiagram = { kind: 'raster' | 'vector'; data: string; size?: DiagramSize };
export interface PreparedExport extends Omit<
	ExportInput,
	'settings' | 'imageResolver' | keyof DiagramRenders
> {
	readonly settings: ExportSettings;
	readonly images: ReadonlyMap<string, string>;
	readonly diagrams: ReadonlyMap<string, PreparedDiagram>;
}
export async function prepareExport(input: ExportInput): Promise<PreparedExport> {
	const images = await fetchImages(
		input.notes.flatMap((note) => collectImageSources(note.document)),
		input.imageResolver
	);
	const diagrams = new Map<string, PreparedDiagram>();
	for (const key of new Set([
		...Object.keys(input.diagramPngs ?? {}),
		...Object.keys(input.diagramSvgs ?? {})
	])) {
		const png = input.diagramPngs?.[key];
		const svg = input.diagramSvgs?.[key];
		const size = input.diagramSizes?.[key] ?? (svg ? svgDimensions(svg) : undefined);
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
export function exportImage(src: string, images: ReadonlyMap<string, string>): string | undefined {
	return src.startsWith('data:') ? src : images.get(src);
}
