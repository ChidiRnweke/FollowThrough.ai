import { AppFactory } from '$lib/server/app-factory';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor();
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

export const actions: Actions = {
	agentPreferences: async ({ request }) => {
		const data = await request.formData();
		const executionMode = data.get('executionMode');
		if (executionMode !== 'approval_required' && executionMode !== 'auto_accept')
			return fail(400, { error: 'Choose a valid execution mode' });
		const defaultModel = String(data.get('defaultModel') ?? '').trim();
		const inlineSuggestionsEnabled = data.get('inlineSuggestionsEnabled') === 'true';
		const factory = AppFactory.controllerFactory();
		await factory.agentSettings().updatePreferences(AppFactory.actor(), {
			defaultModel: defaultModel || null,
			executionMode,
			inlineSuggestionsEnabled
		});
		return { saved: true };
	},

	updateTrustPolicy: async ({ request }) => {
		const data = await request.formData();
		const pipeline = data.get('pipeline');
		const autoAcceptEnabled = data.get('autoAcceptEnabled');
		const minimumConfidence = data.get('minimumConfidence');
		if (typeof pipeline !== 'string' || !pipeline.trim())
			return fail(400, { error: 'Missing pipeline.' });
		const factory = AppFactory.controllerFactory();
		const output = await factory.trustPolicies().update(AppFactory.actor(), {
			pipeline: pipeline as never,
			autoAcceptEnabled: autoAcceptEnabled === 'true',
			...(minimumConfidence !== null && minimumConfidence !== ''
				? { minimumConfidence: Number(minimumConfidence) as never }
				: {})
		});
		return { policy: output.policy };
	}
};
