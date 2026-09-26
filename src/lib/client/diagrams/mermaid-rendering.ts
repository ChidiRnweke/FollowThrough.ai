import DOMPurify from 'dompurify';
import type { Mermaid } from 'mermaid';
import mermaid from 'mermaid';
import type { MermaidTheme } from '$lib/models/diagrams/mermaid-theme';
import { createMermaidConfig, mermaidTokensFor } from '$lib/services/diagrams/mermaid-theme';
export {
	MERMAID_PALETTE_KEYS,
	MERMAID_PALETTE_LABELS,
	type MermaidPalette,
	type MermaidTheme
} from '$lib/models/diagrams/mermaid-theme';
export {
	createMermaidConfig,
	mermaidTokensFor,
	diagramKeepsOwnColours
} from '$lib/services/diagrams/mermaid-theme';

/** (Re)configure mermaid for the given theme. Cheap — safe to call per render. */
export const initializeMermaid = (theme: MermaidTheme | boolean): Mermaid => {
	mermaid.initialize(createMermaidConfig(theme));
	return mermaid;
};

/**
 * Render a diagram without disturbing the page.
 *
 * Given no container, mermaid appends its scratch `<div>` — carrying a full-width SVG —
 * straight into `document.body`, in flow. The page grows, the scrollbar moves, and
 * everything visibly jumps for as long as the render takes; copying a note with several
 * diagrams jumps once per diagram. A fixed, off-screen host keeps the scratch element out
 * of layout while leaving it measurable, which `display: none` would not.
 */
export const renderMermaidOffscreen = async (id: string, source: string): Promise<string> => {
	const host = document.createElement('div');
	host.setAttribute('aria-hidden', 'true');
	host.style.cssText =
		'position: fixed; left: -10000px; top: 0; width: 1200px; visibility: hidden; pointer-events: none;';
	document.body.appendChild(host);
	try {
		const { svg } = await mermaid.render(id, source, host);
		return svg;
	} finally {
		host.remove();
	}
};

/** The background a raster export should paint behind the diagram, if any. */
export const mermaidExportBackground = (theme: MermaidTheme): string | undefined =>
	theme.transparent ? undefined : mermaidTokensFor(theme).background;

export const sanitizeMermaidSvg = (svg: string): string =>
	DOMPurify.sanitize(svg, {
		USE_PROFILES: { svg: true, svgFilters: true }
	});
