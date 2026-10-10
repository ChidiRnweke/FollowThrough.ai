import type { AgentModel } from '$lib/models/agent';

export interface ModelCatalogSnapshot {
	readonly models: readonly AgentModel[];
	readonly refreshedAt: number;
}

/** One snapshot per application catalog. A timestamp never exists without its models. */
export class ModelCatalogStore {
	private value: ModelCatalogSnapshot | undefined;
	get current(): ModelCatalogSnapshot | undefined {
		return this.value;
	}
	replace(snapshot: ModelCatalogSnapshot): void {
		this.value = snapshot;
	}
}
