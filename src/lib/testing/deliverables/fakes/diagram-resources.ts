import type { DiagramRenderResources } from '$lib/models/deliverables';
import type { DiagramRenderResourceReader } from '$lib/server/controllers/deliverables/controller';

export class InMemoryDiagramRenderResources implements DiagramRenderResourceReader {
	failure: Error | undefined;
	readonly started = Promise.withResolvers<void>();
	gate: Promise<void> = Promise.resolve();
	constructor(private readonly resources: DiagramRenderResources) {}
	async read(): Promise<DiagramRenderResources> {
		const failure = this.failure;
		this.started.resolve();
		await this.gate;
		if (failure) throw failure;
		return this.resources;
	}
}
