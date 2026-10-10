import type { MermaidTheme } from '$lib/models/diagrams/mermaid-theme';
import type { DiagramSize, ExportSettings } from '$lib/models/deliverables';
import { svgViewBoxSize } from '$lib/services/deliverables/export-preparation';
import { rasterizeSvg } from '$lib/client/images/rasterize';
import { createMermaidDiagrams } from '$lib/factories/diagrams/mermaid';
const mermaidDiagrams = createMermaidDiagrams();
import type { ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';

/**
 * Rendering the mermaid diagrams an export carries.
 *
 * Interactive exports can supply browser renders. The server renders missing sources for
 * regeneration, agent exports and bundles. Both paths share the same Mermaid theme rules.
 * The resulting raster is what both document generators embed.
 */

export interface DiagramRenders {
	readonly svgs: Record<string, string>;
	readonly pngs: Record<string, string>;
	readonly sizes: Record<string, DiagramSize>;
}

export const emptyDiagramRenders = (): DiagramRenders => ({ svgs: {}, pngs: {}, sizes: {} });

/** Merges two render sets; later entries win on a key collision. */
export const mergeDiagramRenders = (...parts: readonly DiagramRenders[]): DiagramRenders => ({
	svgs: Object.assign({}, ...parts.map((part) => part.svgs)),
	pngs: Object.assign({}, ...parts.map((part) => part.pngs)),
	sizes: Object.assign({}, ...parts.map((part) => part.sizes))
});

const nodeContent = (node: ProseMirrorNode): readonly ProseMirrorNode[] =>
	'content' in node ? (node.content ?? []) : [];

function collectMermaidSources(node: ProseMirrorNode, sources: string[]): void {
	if (node.type === 'mermaid') {
		const text = nodeContent(node)
			.map((child) => (child.type === 'text' ? child.text : ''))
			.join('');
		if (text.trim()) sources.push(text);
		return;
	}
	for (const child of nodeContent(node)) collectMermaidSources(child, sources);
}

/**
 * Rasterize the draw.io diagrams an export carries, keyed by diagram id.
 *
 * Unlike mermaid there is nothing to lay out: draw.io's embed already exported an
 * SVG on save, so this only converts it to the raster DOCX needs and keeps the SVG
 * for the PDF. Ids and mermaid's source hashes share the key space harmlessly —
 * one is a uuid, the other a SHA-256 digest.
 */
export async function renderDrawioDiagrams(
	diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[]
): Promise<DiagramRenders> {
	const svgs: Record<string, string> = {};
	const pngs: Record<string, string> = {};
	const sizes: Record<string, DiagramSize> = {};
	// Rasterized together: each diagram's SVG is already laid out, so they have no
	// bearing on each other and a serial loop just waited on each in turn.
	const rendered = await Promise.all(
		diagrams
			.filter((diagram) => diagram.renderedSvg)
			.map(async (diagram) => ({
				diagram,
				png: await rasterizeSvg(diagram.renderedSvg!)
			}))
	);
	for (const { diagram, png } of rendered) {
		const size = svgViewBoxSize(diagram.renderedSvg!);
		if (size) sizes[diagram.id] = size;
		if (png) pngs[diagram.id] = png;
		else svgs[diagram.id] = diagram.renderedSvg!;
	}
	return { svgs, pngs, sizes };
}

/** Every mermaid source in a set of documents, in document order. */
export function mermaidSourcesIn(
	documents: readonly { document: ProseMirrorDocument }[]
): string[] {
	const sources: string[] = [];
	for (const entry of documents)
		for (const node of entry.document.content ?? []) collectMermaidSources(node, sources);
	return sources;
}

async function sha256hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Render every mermaid block so the server can embed diagrams.
 *
 * The PNG raster is what both formats embed, so it is all that normally travels, together
 * with the viewBox size it should be displayed at. The full SVG markup goes along only for
 * a diagram that failed to rasterize, where the PDF still has an SVG path to fall back to —
 * sending both for every diagram doubled the request body and pushed diagram-heavy exports
 * past the server's body size limit.
 */
export async function renderDiagrams(
	sources: readonly string[],
	settings: ExportSettings
): Promise<DiagramRenders> {
	if (sources.length === 0) return emptyDiagramRenders();
	const svgs: Record<string, string> = {};
	const pngs: Record<string, string> = {};
	const sizes: Record<string, DiagramSize> = {};
	// Diagrams follow the export's own palette, never the reader's colour mode: the
	// document lands somewhere we do not control, and a dark-mode render is unusable
	// on paper. Defaults to light for the same reason.
	const theme: MermaidTheme = {
		base: settings.diagramTheme?.base ?? 'light',
		...(settings.diagramTheme?.colors ? { palette: settings.diagramTheme.colors } : {})
	};
	for (const source of sources) {
		try {
			const markup = await mermaidDiagrams.renderDocument(
				`export-diagram-${crypto.randomUUID()}`,
				source,
				theme
			);
			const hash = await sha256hex(source);
			const size = svgViewBoxSize(markup);
			if (size) sizes[hash] = size;
			const png = await rasterizeSvg(markup);
			if (png) pngs[hash] = png;
			else svgs[hash] = markup;
		} catch (error) {
			throw new Error('A diagram could not be rendered for export', { cause: error });
		}
	}
	return { svgs, pngs, sizes };
}
