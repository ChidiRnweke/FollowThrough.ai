import type { MermaidImageOutput } from '$lib/models/diagrams/mermaid-theme';
const DIMENSION_FALLBACK = { width: 800, height: 600 };

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
				// audit-allow: silent-catch — the Promise executor propagates this exact failure through reject.
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

export class BrowserMermaidImageOutput implements MermaidImageOutput {
	pixelRatio(): number {
		return window.devicePixelRatio || 1;
	}
	rasterise(svg: string, background: string | undefined, scale: number): Promise<string> {
		return rasterise(svg, background, scale);
	}
	async blob(dataUrl: string): Promise<Blob> {
		return await (await fetch(dataUrl)).blob();
	}
	downloadSvg(svg: string, name: string): void {
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
		try {
			triggerDownload(url, `${name}.svg`);
		} finally {
			URL.revokeObjectURL(url);
		}
	}
	downloadPng(dataUrl: string, name: string): void {
		triggerDownload(dataUrl, `${name}.png`);
	}
}
