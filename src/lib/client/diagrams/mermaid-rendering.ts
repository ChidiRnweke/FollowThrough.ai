import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import type { MermaidRenderConfig, MermaidSvgRenderer } from '$lib/models/diagrams/mermaid-theme';
/**
 * Render a diagram without disturbing the page.
 *
 * Given no container, mermaid appends its scratch `<div>` — carrying a full-width SVG —
 * straight into `document.body`, in flow. The page grows, the scrollbar moves, and
 * everything visibly jumps for as long as the render takes; copying a note with several
 * diagrams jumps once per diagram. A fixed, off-screen host keeps the scratch element out
 * of layout while leaving it measurable, which `display: none` would not.
 */
const renderMermaidOffscreen = async (id: string, source: string): Promise<string> => {
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

const sanitizeMermaidSvg = (svg: string): string =>
	DOMPurify.sanitize(svg, {
		USE_PROFILES: { svg: true, svgFilters: true }
	});

export class BrowserMermaidRenderer implements MermaidSvgRenderer {
	async render(
		id: string,
		source: string,
		config: MermaidRenderConfig,
		mode: 'screen' | 'document'
	): Promise<string> {
		mermaid.initialize(config);
		if (mode === 'document') {
			const { svg } = await mermaid.render(id, source);
			return sanitizeMermaidSvg(inlineSvgStyles(svg));
		}
		return sanitizeMermaidSvg(await renderMermaidOffscreen(id, source));
	}
}
