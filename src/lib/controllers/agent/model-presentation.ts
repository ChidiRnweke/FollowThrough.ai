import type { NamedModel, EffectiveModel, DescribedModel } from '$lib/models/agent/model-label';
import type { ModelPresentation } from '$lib/services/agent/model-label';

export interface ModelPresentationController {
	shortModelName(name: string): string;
	effectiveModel(
		models: readonly NamedModel[],
		override: string | null,
		defaultModelId: string
	): EffectiveModel;
	modelMetaLine(model: DescribedModel): string;
	modelMatchesQuery(model: NamedModel, query: string): boolean;
}
export class ModelPresentationOperations implements ModelPresentationController {
	constructor(private readonly modelPresentation: ModelPresentation) {}
	readonly shortModelName = (name: string): string => this.modelPresentation.shortModelName(name);
	readonly effectiveModel = (
		models: readonly NamedModel[],
		override: string | null,
		defaultModelId: string
	): EffectiveModel => this.modelPresentation.effectiveModel(models, override, defaultModelId);
	readonly modelMetaLine = (model: DescribedModel): string =>
		this.modelPresentation.modelMetaLine(model);
	readonly modelMatchesQuery = (model: NamedModel, query: string): boolean =>
		this.modelPresentation.modelMatchesQuery(model, query);
}
