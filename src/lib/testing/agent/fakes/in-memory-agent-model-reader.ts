import type { AgentCatalogMetadata } from '$lib/models/agent';
import type { AgentModelReader } from '$lib/server/services/agent/runs/preferences';

export class InMemoryAgentModelReader implements AgentModelReader {
	constructor(public entries: readonly AgentCatalogMetadata[] = []) {}
	async list(): Promise<{ readonly data: readonly AgentCatalogMetadata[] }> {
		return { data: this.entries };
	}
}
