import { AppFactory } from '$lib/server/factories/app-factory';
import { parseSidebarWidth } from '$lib/models/workspace';
import { SIDEBAR_WIDTH_COOKIE_NAME } from '$lib/components/ui/sidebar/constants';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	// Determine the actor: use authenticated user or fallback to local user
	if (AppFactory.isAuthEnabled() && !locals.user) {
		throw redirect(303, '/auth/login');
	}
	const actor = AppFactory.actor(locals);

	const factory = AppFactory.controllers();
	const [shell, agentPreferences, sessions] = await Promise.all([
		factory.workspace().getShellContext(actor),
		factory.agentSettings().getPreferences(actor),
		factory.agent().listSessions(actor, { limit: 5 })
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
				supportsVision: false,
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
		sidebarOpen: cookies.get('sidebar_state') !== 'false',
		sidebarWidth: parseSidebarWidth(cookies.get(SIDEBAR_WIDTH_COOKIE_NAME))
	};
};
