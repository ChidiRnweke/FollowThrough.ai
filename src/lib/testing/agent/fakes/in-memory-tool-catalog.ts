import type { ResolvedToolCatalogEntry } from '$lib/models/agent/tool-catalog';
import type { AgentToolCatalog } from '$lib/services/agent/tool-catalog';
export class InMemoryToolCatalog implements Pick<AgentToolCatalog, 'entries'> {
	constructor(private readonly catalog: readonly ResolvedToolCatalogEntry[]) {}
	entries(): readonly ResolvedToolCatalogEntry[] {
		return this.catalog;
	}
}
