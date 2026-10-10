import {
	DiagramExportRendering,
	type DiagramExportRenderer
} from '$lib/server/controllers/deliverables/diagram-rendering';
import { DiagramRenderResourceStore } from '$lib/server/stores/deliverables/diagram-resources';
import { NodeDiagramRenderResources } from '$lib/server/adapters/deliverables/diagram-resources';
import { BrowserDiagramRasterizer } from '$lib/server/adapters/deliverables/diagram-rendering';
export const createDiagramExportRenderer = (): DiagramExportRenderer =>
	new DiagramExportRendering(
		new DiagramRenderResourceStore(),
		new NodeDiagramRenderResources(),
		new BrowserDiagramRasterizer()
	);
