import type { WebResearchOptions, WebResearchSettings } from '$lib/models/agent';

/** Resolve each selected setting against the caller's explicit deployment or product defaults. */
export const resolveWebResearch = (
	options: WebResearchOptions,
	defaults: WebResearchSettings
): WebResearchSettings => ({
	engine: options.engine ?? defaults.engine,
	maxResults: options.maxResults ?? defaults.maxResults,
	maxTotalResults: options.maxTotalResults ?? defaults.maxTotalResults
});
