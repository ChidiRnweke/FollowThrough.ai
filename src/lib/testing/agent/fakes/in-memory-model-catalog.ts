import type { AgentModel } from '$lib/models/agent';
import type { AgentModelCatalog } from '$lib/server/services/agent/runs/preferences';
import { ValidationError } from '$lib/errors';

export class InMemoryModelCatalog implements AgentModelCatalog {
	models: AgentModel[] = [];
	async list(): Promise<readonly AgentModel[]> {
		return this.models;
	}
	async assertSelectable(modelId: string): Promise<void> {
		if (!this.models.some((model) => model.id === modelId && model.supportsTools))
			throw new ValidationError('The selected model is unavailable or does not support tools');
	}
}
