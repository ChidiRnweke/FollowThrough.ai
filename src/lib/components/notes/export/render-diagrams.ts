import { mode } from 'mode-watcher';
import type { DiagramSize, ExportSettings } from '$lib/models/deliverables';
import { svgViewBoxSize } from '$lib/models/deliverables';
import {
	initializeMermaid,
	sanitizeMermaidSvg
} from '$lib/components/edra/mermaid-rendering';

/**
 * Rendering the mermaid diagrams an export carries.
 *
 * Diagrams are rendered in the browser rather than on the server: mermaid needs a DOM to
 * lay one out, and the resulting raster is what both generators embed. Shared by the
 * single-note and bulk export dialogs so the two produce the same documents.
 */

export interface DiagramRenders {
	readonly svgs: Record<string, string>;
	readonly pngs: Record<string, string>;
	readonly sizes: Record<string, DiagramSize>;
}

export const emptyDiagramRenders = (): DiagramRenders => ({ svgs: {}, pngs: {}, sizes: {} });

function collectMermaidSources(node: unknown, sources: string[]): void {
	if (typeof node !== 'object' || node === null) return;
	const record = node as { type?: string; text?: string; content?: unknown[] };
	if (record.type === 'mermaid') {
		const text = (record.content ?? [])
			.map((child) => (child as { text?: string }).text ?? '')
			.join('');
		if (text.trim()) sources.push(text);
		return;
	}
	for (const child of record.content ?? []) collectMermaidSources(child, sources);
}

/** Every mermaid source in a set of documents, in document order. */
export function mermaidSourcesIn(documents: readonly { document: unknown }[]): string[] {
	const sources: string[] = [];
	for (const entry of documents) collectMermaidSources(entry.document, sources);
	return sources;
}

async function sha256hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const INLINED_PROPERTIES = [
	'fill',
	'fill-opacity',
	'stroke',
	'stroke-width',
	'stroke-dasharray',
	'opacity',
	'font-size',
	'font-weight',
	'text-anchor'
];

/**
 * Mermaid styles its SVG through a <style> block, which PDF SVG rendering ignores.
 * Mount the SVG off-screen and bake the computed styles into presentation attributes.
 */
function inlineSvgStyles(markup: string): string {
	const host = document.createElement('div');
	host.style.position = 'fixed';
	host.style.left = '-10000px';
	host.style.top = '0';
	host.innerHTML = markup;
	document.body.appendChild(host);
	try {
		const svg = host.querySelector('svg');
		if (!svg) return markup;
		const elements = [...svg.querySelectorAll('*')].filter(
			(element) => element.tagName.toLowerCase() !== 'style'
		);
		// Read all computed values before mutating anything: stripping a class would
		// break the CSS selectors that style the element's descendants.
		const resolved = elements.map((element) => {
			const computed = getComputedStyle(element);
			return INLINED_PROPERTIES.map(
				(property) => [property, computed.getPropertyValue(property)] as const
			);
		});
		elements.forEach((element, index) => {
			for (const [property, value] of resolved[index]!) {
				if (value) element.setAttribute(property, value.replaceAll('px', ''));
			}
			element.removeAttribute('class');
			element.removeAttribute('style');
		});
		svg.querySelectorAll('style').forEach((styleElement) => styleElement.remove());
		svg.removeAttribute('style');
		return svg.outerHTML;
	} finally {
		host.remove();
	}
}

/**
 * Rasterize an SVG to a PNG data URL. DOCX embeds rasters (the docx library only
 * takes SVG with a mandatory raster fallback), so diagrams ship in both forms:
 * SVG for the PDF, PNG for the DOCX.
 */
async function rasterizeSvg(svgMarkup: string, scale = 2): Promise<string | null> {
	try {
		const url = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml' }));
		try {
			const image = new Image();
			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error('SVG rasterization failed'));
				image.src = url;
			});
			// Mermaid SVGs size themselves through max-width, not width/height, so the
			// viewBox is the only reliable natural size.
			const viewBox = /viewBox="([\d.\s-]+)"/
				.exec(svgMarkup)?.[1]
				?.trim()
				.split(/\s+/)
				.map(Number);
			const baseWidth = viewBox?.[2] || image.naturalWidth || 800;
			const baseHeight = viewBox?.[3] || image.naturalHeight || 600;
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(baseWidth * scale);
			canvas.height = Math.round(baseHeight * scale);
			const context2d = canvas.getContext('2d');
			if (!context2d) return null;
			// Transparent pixels print as black boxes in some Word viewers.
			context2d.fillStyle = '#ffffff';
			context2d.fillRect(0, 0, canvas.width, canvas.height);
			context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
			return canvas.toDataURL('image/png');
		} finally {
			URL.revokeObjectURL(url);
		}
	} catch {
		return null;
	}
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
	const mermaid = initializeMermaid({
		base: settings.diagramTheme?.base ?? 'light',
		...(settings.diagramTheme?.colors ? { palette: settings.diagramTheme.colors } : {})
	});
	try {
		for (const source of sources) {
			try {
				const { svg } = await mermaid.render(`export-diagram-${crypto.randomUUID()}`, source);
				// Inline before sanitizing: the sanitizer strips the <style> block the
				// computed styles are read from.
				const markup = sanitizeMermaidSvg(inlineSvgStyles(svg));
				const hash = await sha256hex(source);
				const size = svgViewBoxSize(markup);
				if (size) sizes[hash] = size;
				const png = await rasterizeSvg(markup);
				if (png) pngs[hash] = png;
				else svgs[hash] = markup;
			} catch {
				// A diagram that fails to render falls back to its source in the document.
			}
		}
	} finally {
		initializeMermaid(mode.current === 'dark');
	}
	return { svgs, pngs, sizes };
}
