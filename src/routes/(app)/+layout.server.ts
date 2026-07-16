import { AppFactory } from '$lib/server/app-factory';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const factory = AppFactory.controllerFactory();
	const actor = AppFactory.actor();
	const [shell, agentPreferences, sessions] = await Promise.all([
		factory.workspace().getShellContext(actor),
		factory.agentSettings().getPreferences(actor),
		factory.agent().listSessions(actor)
	]);
	let agentModels = await factory
		.agentSettings()
		.listModels(actor)
		.catch(() => []);
	if (
		agentPreferences.defaultModel &&
		!agentModels.some((model) => model.id === agentPreferences.defaultModel)
	)
		agentModels = [
			{
				id: agentPreferences.defaultModel,
				name: agentPreferences.defaultModel,
				provider: agentPreferences.defaultModel.split('/')[0] ?? 'Configured',
				supportsTools: true,
				recommended: false,
				capabilities: ['configured']
			},
			...agentModels
		];
	return {
		shell,
		sessions,
		agentPreferences,
		agentModels,
		agentAvailable: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
		sidebarOpen: cookies.get('sidebar_state') !== 'false'
	};
};
