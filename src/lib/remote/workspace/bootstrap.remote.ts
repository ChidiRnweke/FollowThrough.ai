import { z } from 'zod';
import {
	CHAT_WEB_SEARCH_DEFAULTS,
	DEFAULT_AGENT_MAX_TURNS,
	webSearchOptionsFromEnvironment
} from '$lib/models/agent';
import { command } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';

export const readWorkspaceBootstrap = command(z.object({}), async () => {
	const actor = requestActor();
	const settings = AppFactory.controllers().agentSettings();
	const [agentDefaults, models] = await Promise.all([
		settings.deploymentDefaults(actor),
		settings.listModels(actor)
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
	const environment = webSearchOptionsFromEnvironment(process.env);
	return {
		accountId: actor.userId,
		agentDefaults,
		agentModels,
		numericDefaults: {
			webSearchMaxResults: environment.maxResults ?? CHAT_WEB_SEARCH_DEFAULTS.maxResults,
			webSearchMaxTotalResults:
				environment.maxTotalResults ?? CHAT_WEB_SEARCH_DEFAULTS.maxTotalResults,
			agentMaxTurns: DEFAULT_AGENT_MAX_TURNS
		},
		agentAvailable: Boolean(process.env.OPENROUTER_API_KEY?.trim())
	};
});
