import type { DiagramRenderResources } from '$lib/models/deliverables';
import type { DiagramRenderResourceReader } from '$lib/server/controllers/deliverables/diagram-rendering';

export class InMemoryDiagramRenderResources implements DiagramRenderResourceReader {
	failure: Error | undefined;
	gate: Promise<void> = Promise.resolve();
	constructor(private readonly resources: DiagramRenderResources) {}
	async read(): Promise<DiagramRenderResources> {
		const failure = this.failure;
		await this.gate;
		if (failure) throw failure;
		return this.resources;
	}
}
