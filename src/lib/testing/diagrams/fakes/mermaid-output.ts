import type { MermaidImageOutput } from '$lib/models/diagrams/mermaid-theme';
export class InMemoryMermaidOutput implements MermaidImageOutput {
	readonly downloads: { format: 'png' | 'svg'; name: string; content: string }[] = [];
	readonly rasters: { svg: string; background: string | undefined; scale: number }[] = [];
	pixelRatio(): number {
		return 2;
	}
	async rasterise(svg: string, background: string | undefined, scale: number): Promise<string> {
		this.rasters.push({ svg, background, scale });
		return 'data:image/png;base64,cG5n';
	}
	async blob(_dataUrl: string): Promise<Blob> {
		void _dataUrl;
		return new Blob(['png'], { type: 'image/png' });
	}
	downloadSvg(svg: string, name: string): void {
		this.downloads.push({ format: 'svg', name, content: svg });
	}
	downloadPng(dataUrl: string, name: string): void {
		this.downloads.push({ format: 'png', name, content: dataUrl });
	}
}
