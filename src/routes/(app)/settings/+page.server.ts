import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

// Not exported: SvelteKit only permits `load`/`actions`/etc. out of a
// +page.server.ts, and rejects the module at runtime otherwise.
const SETTINGS_TABS = ['agent', 'tools', 'mcp', 'policies'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * `agent` is the default because the agent settings popover deep-links to a
 * bare `/settings` for "Defaults and prompt preferences".
 */
const tabFrom = (value: string | null): SettingsTab =>
	SETTINGS_TABS.includes(value as SettingsTab) ? (value as SettingsTab) : 'agent';

export const load: PageServerLoad = async ({ locals, url }) => {
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);
	const tab = tabFrom(url.searchParams.get('tab'));
	const output = await factory.trustPolicies().list(actor);
	const preferences = await factory.agentSettings().getPreferences(actor);
	// The model catalogue is the only outbound call on this page, so it is worth
	// skipping entirely when the tab that renders it is not the one being viewed.
	let models =
		tab === 'agent'
			? await factory
					.agentSettings()
					.listModels(actor)
					.catch(() => [])
			: [];
	if (
		tab === 'agent' &&
		preferences.defaultModel &&
		!models.some((model) => model.id === preferences.defaultModel)
	) {
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
	// `/settings` has no ambient project, so the tool-scope picker needs the list
	// to offer. Only the tools tab uses it.
	const projects =
		tab === 'tools'
			? (await factory.projects().list(actor)).projects
					.filter((project) => !project.archivedAt)
					.map((project) => ({ id: project.id, name: project.name }))
			: [];
	return {
		tab,
		projects,
		policies: output.policies,
		preferences,
		models,
		// Shown so the user can paste it straight into a client config.
		mcpEndpoint: new URL('/mcp', url.origin).toString()
	};
};
