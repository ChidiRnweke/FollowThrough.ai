import type {
	MermaidTheme,
	MermaidPaletteView,
	MermaidExportRequest,
	MermaidSvgRenderer,
	MermaidImageOutput
} from '$lib/models/diagrams/mermaid-theme';
import type { MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
export interface MermaidController {
	appearance(theme: MermaidTheme | boolean): MermaidPaletteView;
	keepsOwnColours(source: string): boolean;
	render(id: string, source: string, theme: MermaidTheme | boolean): Promise<string>;
	renderDocument(id: string, source: string, theme: MermaidTheme): Promise<string>;
	png(source: string, theme: MermaidTheme, scale?: number): Promise<Blob>;
	download(request: MermaidExportRequest): Promise<void>;
}
export class MermaidDiagrams implements MermaidController {
	constructor(
		private readonly themes: MermaidThemeRules,
		private readonly renderer: MermaidSvgRenderer,
		private readonly output: MermaidImageOutput
	) {}
	appearance(theme: MermaidTheme | boolean): MermaidPaletteView {
		const { tokens, background } = this.themes.resolve(theme);
		return { tokens, background };
	}
	keepsOwnColours(source: string): boolean {
		return this.themes.keepsOwnColours(source);
	}
	render(id: string, source: string, theme: MermaidTheme | boolean): Promise<string> {
		return this.renderer.render(id, source, this.themes.resolve(theme).config, 'screen');
	}
	renderDocument(id: string, source: string, theme: MermaidTheme): Promise<string> {
		return this.renderer.render(id, source, this.themes.resolve(theme).config, 'document');
	}
	async png(source: string, theme: MermaidTheme, scale?: number): Promise<Blob> {
		const svg = await this.render(`mermaid-export-${crypto.randomUUID()}`, source, theme);
		const dataUrl = await this.output.rasterise(
			svg,
			this.themes.resolve(theme).background,
			scale ?? this.output.pixelRatio()
		);
		return this.output.blob(dataUrl);
	}
	async download(request: MermaidExportRequest): Promise<void> {
		const svg = await this.render(
			`mermaid-export-${crypto.randomUUID()}`,
			request.source,
			request.theme
		);
		const name = request.fileName ?? 'diagram';
		if (request.format === 'svg') {
			this.output.downloadSvg(svg, name);
			return;
		}
		const dataUrl = await this.output.rasterise(
			svg,
			this.themes.resolve(request.theme).background,
			request.scale ?? this.output.pixelRatio()
		);
		this.output.downloadPng(dataUrl, name);
	}
}
