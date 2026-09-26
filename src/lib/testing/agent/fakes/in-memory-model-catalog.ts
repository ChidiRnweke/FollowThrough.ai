import type { AgentModel } from '$lib/models/agent';
import type { AgentModelCatalog } from '$lib/server/services/agent/runs/preferences';

export class InMemoryModelCatalog implements AgentModelCatalog {
	models: AgentModel[] = [];
	failure: Error | undefined;
	async list(): Promise<readonly AgentModel[]> {
		if (this.failure) throw this.failure;
		return this.models;
	}
}
