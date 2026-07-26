import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor(locals);
	const output = await factory.trustPolicies().list(actor);
	const preferences = await factory.agentSettings().getPreferences(actor);
	let models = await factory
		.agentSettings()
		.listModels(actor)
		.catch(() => []);
	if (preferences.defaultModel && !models.some((model) => model.id === preferences.defaultModel)) {
		models = [
			{
				id: preferences.defaultModel,
				name: preferences.defaultModel,
				provider: preferences.defaultModel.split('/')[0] ?? 'Configured',
				supportsTools: true,
				recommended: false,
				capabilities: ['configured']
			},
			...models
		];
	}
	return { policies: output.policies, preferences, models };
};
