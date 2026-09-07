import { z } from 'zod';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

export const readWorkspaceBootstrap = command(z.object({}), async () => {
	const actor = requestActor();
	const settings = AppFactory.controllers().agentSettings();
	const [agentDefaults, models, agentPreferences] = await Promise.all([
		settings.resolveDefaults(actor),
		settings.listModels(actor),
		settings.getPreferences(actor)
	]);
	const agentModels = models.some((model) => model.id === agentDefaults.chatModelId)
		? models
		: [
				...models,
				{
					id: agentDefaults.chatModelId,
					name: agentDefaults.chatModelId,
					provider: agentDefaults.chatModelId.split('/')[0],
					supportsTools: true,
					supportsVision: false,
					recommended: false,
					capabilities: ['configured']
				}
			];
	return {
		accountId: actor.userId,
		agentPreferences,
		agentDefaults,
		agentModels,
		agentAvailable: Boolean(process.env.OPENROUTER_API_KEY?.trim())
	};
});
