import mermaid from 'mermaid';
import {
	createMermaidConfig,
	mermaidExportBackground,
	sanitizeMermaidSvg,
	type MermaidTheme
} from './mermaid-rendering.js';

/**
 * Exporting a diagram out of the app.
 *
 * The old path serialized whatever was on screen and painted `document.body`'s background
 * behind it, so a diagram exported in dark mode arrived as light strokes on a near-black
 * fill — unusable in any document that is not also dark. Re-rendering at the chosen theme,
 * and letting the background be omitted entirely, is the fix; SVG is offered because a
 * diagram is line art and rasterising it at one size throws that away.
 */

export type MermaidExportFormat = 'png' | 'svg';

export interface MermaidExportRequest {
	readonly source: string;
	readonly theme: MermaidTheme;
	readonly format: MermaidExportFormat;
	/** Raster scale. Ignored for SVG, which needs no resolution decision. */
	readonly scale?: number;
	readonly fileName?: string;
}

const DIMENSION_FALLBACK = { width: 800, height: 600 };

/** Render the source at the requested theme rather than reusing the on-screen SVG. */
const renderAtTheme = async (source: string, theme: MermaidTheme): Promise<string> => {
	mermaid.initialize(createMermaidConfig(theme));
	const { svg } = await mermaid.render(`mermaid-export-${crypto.randomUUID()}`, source);
	return sanitizeMermaidSvg(svg);
};

const dimensionsOf = (svg: string): { width: number; height: number } => {
	const viewBox = /viewBox="([\d.\-\s]+)"/.exec(svg)?.[1]?.trim().split(/\s+/);
	if (viewBox?.length === 4) {
		const width = Number(viewBox[2]);
		const height = Number(viewBox[3]);
		if (width > 0 && height > 0) return { width, height };
	}
	return DIMENSION_FALLBACK;
};

const triggerDownload = (href: string, fileName: string): void => {
	const link = document.createElement('a');
	link.href = href;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
};

const rasterise = (svg: string, background: string | undefined, scale: number): Promise<string> =>
	new Promise((resolve, reject) => {
		const { width, height } = dimensionsOf(svg);
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
		const image = new Image();
		image.onload = () => {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = Math.round(width * scale);
				canvas.height = Math.round(height * scale);
				const context = canvas.getContext('2d');
				if (!context) throw new Error('This browser could not provide a canvas to draw on.');
				context.scale(scale, scale);
				// Left unpainted when transparent, so the diagram takes the colour of
				// whatever document it is dropped into.
				if (background) {
					context.fillStyle = background;
					context.fillRect(0, 0, width, height);
				}
				context.drawImage(image, 0, 0, width, height);
				resolve(canvas.toDataURL('image/png'));
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			} finally {
				URL.revokeObjectURL(url);
			}
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('The diagram could not be rendered for export.'));
		};
		image.src = url;
	});

/**
 * The diagram as a PNG blob — for the clipboard, where triggering a download
 * makes no sense. Same render-at-theme + rasterise pipeline as the file export.
 */
export const mermaidPngBlob = async (
	source: string,
	theme: MermaidTheme,
	scale: number = window.devicePixelRatio || 1
): Promise<Blob> => {
	const svg = await renderAtTheme(source, theme);
	const dataUrl = await rasterise(svg, mermaidExportBackground(theme), scale);
	return await (await fetch(dataUrl)).blob();
};

export const exportMermaidDiagram = async (request: MermaidExportRequest): Promise<void> => {
	const svg = await renderAtTheme(request.source, request.theme);
	const name = request.fileName ?? 'diagram';

	if (request.format === 'svg') {
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
		triggerDownload(url, `${name}.svg`);
		URL.revokeObjectURL(url);
		return;
	}

	const scale = request.scale ?? (window.devicePixelRatio || 1);
	triggerDownload(
		await rasterise(svg, mermaidExportBackground(request.theme), scale),
		`${name}.png`
	);
};
