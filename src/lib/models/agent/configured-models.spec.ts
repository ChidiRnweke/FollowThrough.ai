import { expect, it } from 'vitest';
import { configuredAgentModels } from './index';
it('keeps configured chat and vision models selectable outside the catalog', () => {
	expect(
		configuredAgentModels([], { chatModelId: 'custom/chat', visionModelId: 'custom/vision' }).map(
			(model) => model.id
		)
	).toEqual(['custom/chat', 'custom/vision']);
});
it('does not duplicate a model configured for both roles', () => {
	expect(
		configuredAgentModels([], { chatModelId: 'custom/shared', visionModelId: 'custom/shared' }).map(
			(model) => model.id
		)
	).toEqual(['custom/shared']);
});
