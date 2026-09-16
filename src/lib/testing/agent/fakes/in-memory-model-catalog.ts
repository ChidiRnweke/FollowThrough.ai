import type { AgentModel } from '$lib/models/agent';
import type { AgentModelCatalog } from '$lib/server/services/agent/runs/preferences';
import { ValidationError } from '$lib/errors';

export class InMemoryModelCatalog implements AgentModelCatalog {
	models: AgentModel[] = [];
	failure: Error | undefined;
	async list(): Promise<readonly AgentModel[]> {
		if (this.failure) throw this.failure;
		return this.models;
	}
	async assertSelectable(modelId: string): Promise<void> {
		if (!this.models.some((model) => model.id === modelId && model.supportsTools))
			throw new ValidationError('The selected model is unavailable or does not support tools');
	}
}
