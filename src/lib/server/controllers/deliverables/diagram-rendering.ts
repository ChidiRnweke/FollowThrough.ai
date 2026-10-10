import type {
	DiagramRenderResources,
	ExportDiagramSource,
	ExportDiagramRaster
} from '$lib/models/deliverables';
import type { MermaidRenderConfig } from '$lib/models/diagrams/mermaid-theme';

import type { DiagramRenderResourceStore } from '$lib/server/stores/deliverables/diagram-resources';
export interface DiagramExportRenderer {
	render(
		sources: readonly ExportDiagramSource[],
		config: MermaidRenderConfig
	): Promise<ReadonlyMap<string, ExportDiagramRaster>>;
}
export class DiagramExportRendering implements DiagramExportRenderer {
	constructor(
		private readonly state: DiagramRenderResourceStore,
		private readonly reader: DiagramRenderResourceReader,
		private readonly renderer: DiagramRasterRendering
	) {}
	async render(
		sources: readonly ExportDiagramSource[],
		config: MermaidRenderConfig
	): Promise<ReadonlyMap<string, ExportDiagramRaster>> {
		if (!sources.length) return new Map();
		const resources = await this.resources();
		return this.renderer.render(sources, config, resources);
	}
	private async resources(): Promise<DiagramRenderResources> {
		const state = this.state.current;
		if (state.kind === 'ready') return state.resources;
		if (state.kind === 'loading') return state.pending;
		const pending = this.reader.read().then(
			(resources) => {
				this.state.setReady(resources);
				return resources;
			},
			(error) => {
				this.state.clear();
				throw new Error('A diagram could not be rendered for export', { cause: error });
			}
		);
		this.state.setLoading(pending);
		return pending;
	}
}

/** Local font/script reader; no domain rules or retained state. */
export interface DiagramRenderResourceReader {
	read(): Promise<DiagramRenderResources>;
}
/** Disposable browser rasterization with fully resolved immutable resources. */
export interface DiagramRasterRendering {
	render(
		sources: readonly ExportDiagramSource[],
		config: MermaidRenderConfig,
		resources: DiagramRenderResources
	): Promise<ReadonlyMap<string, ExportDiagramRaster>>;
}
