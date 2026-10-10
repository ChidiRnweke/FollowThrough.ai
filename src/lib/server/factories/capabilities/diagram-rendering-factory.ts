import type { DiagramRenderCache } from '$lib/server/stores/deliverables/diagram-resources';
import type {
	DiagramRenderResourceReader,
	DiagramRasterRendering
} from '$lib/server/controllers/deliverables/controller';
import { DiagramRenderResourceStore } from '$lib/server/stores/deliverables/diagram-resources';
import { NodeDiagramRenderResources } from '$lib/server/adapters/deliverables/diagram-resources';
import { BrowserDiagramRasterizer } from '$lib/server/adapters/deliverables/diagram-rendering';
export const createDiagramExportRenderer = (): {
	state: DiagramRenderCache;
	reader: DiagramRenderResourceReader;
	renderer: DiagramRasterRendering;
} => ({
	state: new DiagramRenderResourceStore(),
	reader: new NodeDiagramRenderResources(),
	renderer: new BrowserDiagramRasterizer()
});
