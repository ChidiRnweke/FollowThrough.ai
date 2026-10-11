import { ModelPresentationService } from '$lib/services/agent/model-label';
import {
	ModelPresentationOperations,
	type ModelPresentationController
} from '$lib/controllers/agent/model-presentation';
export const modelPresentationOperations: ModelPresentationController =
	new ModelPresentationOperations(new ModelPresentationService());
