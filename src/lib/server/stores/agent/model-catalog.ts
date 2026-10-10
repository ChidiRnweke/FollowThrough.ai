import type { ModelCatalogCache, ModelCatalogSnapshot } from '$lib/models/agent';

/** One snapshot per application catalog. Refresh policy belongs to the catalog service. */
export class ModelCatalogStore implements ModelCatalogCache {
	private value: ModelCatalogSnapshot | undefined;
	get current(): ModelCatalogSnapshot | undefined {
		return this.value;
	}
	replace(snapshot: ModelCatalogSnapshot): void {
		this.value = snapshot;
	}
}
