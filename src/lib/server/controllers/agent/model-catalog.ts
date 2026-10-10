import type { AgentModel } from '$lib/models/agent';
import type { AgentModelCatalog } from '$lib/server/services/agent/runs/preferences';
import type { ModelCatalogStore } from '$lib/server/stores/agent/model-catalog';

/** Owns refresh sequencing; the provider reader is stateless and the store only retains data. */
export class CachedAgentModels implements AgentModelCatalog {
	constructor(
		private readonly source: AgentModelCatalog,
		private readonly store: ModelCatalogStore,
		private readonly ttlMs = 5 * 60 * 1000,
		private readonly clock: () => number = Date.now
	) {}
	async list(): Promise<readonly AgentModel[]> {
		const cached = this.store.current;
		if (cached && this.clock() - cached.refreshedAt < this.ttlMs) return cached.models;
		try {
			const models = await this.source.list();
			this.store.replace({ models, refreshedAt: this.clock() });
			return models;
		} catch (error) {
			// Preserve the existing catalog's stale-on-refresh-failure behavior.
			const retained = this.store.current;
			if (retained) return retained.models;
			throw error;
		}
	}
}
