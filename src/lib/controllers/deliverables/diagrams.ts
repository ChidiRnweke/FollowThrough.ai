import type { ProseMirrorDocument } from '$lib/models/notes';
import type { ExportSettings, DiagramSize, ExportDiagramImages } from '$lib/models/deliverables';
import type { MermaidTheme } from '$lib/models/diagrams/mermaid-theme';
import type { ExportPreparation } from '$lib/services/deliverables/export-preparation';
import type { MermaidController } from '$lib/controllers/diagrams/mermaid';
export interface ExportDiagramImageAdapter {
	rasterize(svg: string): Promise<string | null>;
	hash(value: string): Promise<string>;
}
export interface DiagramExportController {
	inspect(documents: readonly { document: ProseMirrorDocument }[]): {
		readonly hasDiagrams: boolean;
		readonly hasSelfStyledDiagrams: boolean;
	};
	render(
		documents: readonly { document: ProseMirrorDocument }[],
		diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[],
		settings: ExportSettings
	): Promise<ExportDiagramImages>;
}
export class ExportDiagrams implements DiagramExportController {
	constructor(
		private readonly preparation: ExportPreparation,
		private readonly mermaid: MermaidController,
		private readonly images: ExportDiagramImageAdapter
	) {}
	private sources(documents: readonly { document: ProseMirrorDocument }[]): string[] {
		return documents.flatMap(({ document }) =>
			this.preparation
				.assets(document)
				.diagrams.flatMap((diagram) => (diagram.kind === 'mermaid' ? [diagram.source] : []))
		);
	}
	inspect(documents: readonly { document: ProseMirrorDocument }[]) {
		const sources = this.sources(documents);
		return {
			hasDiagrams: sources.length > 0,
			hasSelfStyledDiagrams: sources.some((source) => this.mermaid.keepsOwnColours(source))
		};
	}
	async render(
		documents: readonly { document: ProseMirrorDocument }[],
		diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[],
		settings: ExportSettings
	): Promise<ExportDiagramImages> {
		const ids = new Set(
			documents.flatMap(({ document }) =>
				this.preparation
					.assets(document)
					.diagrams.flatMap((diagram) => (diagram.kind === 'drawio' ? [diagram.diagramId] : []))
			)
		);
		const referenced = [...ids].flatMap((id) => {
			const diagram = diagrams.find((diagram) => diagram.id === id);
			return diagram ? [diagram] : [];
		});
		const [mermaid, drawio] = await Promise.all([
			this.renderMermaid(this.sources(documents), settings),
			this.renderDrawio(referenced)
		]);
		return {
			svgs: { ...mermaid.svgs, ...drawio.svgs },
			pngs: { ...mermaid.pngs, ...drawio.pngs },
			sizes: { ...mermaid.sizes, ...drawio.sizes }
		};
	}
	private async renderDrawio(
		diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[]
	): Promise<ExportDiagramImages> {
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
					png: await this.images.rasterize(diagram.renderedSvg!)
				}))
		);
		for (const { diagram, png } of rendered) {
			const size = this.preparation.diagramSize(diagram.renderedSvg!);
			if (size) sizes[diagram.id] = size;
			if (png) pngs[diagram.id] = png;
			else svgs[diagram.id] = diagram.renderedSvg!;
		}
		return { svgs, pngs, sizes };
	}

	private async renderMermaid(
		sources: readonly string[],
		settings: ExportSettings
	): Promise<ExportDiagramImages> {
		if (sources.length === 0) return { svgs: {}, pngs: {}, sizes: {} };
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
				const markup = await this.mermaid.renderDocument(
					`export-diagram-${crypto.randomUUID()}`,
					source,
					theme
				);
				const hash = await this.images.hash(source);
				const size = this.preparation.diagramSize(markup);
				if (size) sizes[hash] = size;
				const png = await this.images.rasterize(markup);
				if (png) pngs[hash] = png;
				else svgs[hash] = markup;
			} catch (error) {
				throw new Error('A diagram could not be rendered for export', { cause: error });
			}
		}
		return { svgs, pngs, sizes };
	}
}
